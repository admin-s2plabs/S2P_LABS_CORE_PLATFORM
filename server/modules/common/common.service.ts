import { umOrgMapDtls } from "@shared/schema";
import argon2 from "argon2";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import type pkg from "pg";
import { v4 as uuidv4 } from "uuid";
import { db } from "../../db";
import { eventBus } from "../../services/eventBus";
import { ChangePasswordEvent, ContactUsEvent, EventTypes, ForgotPasswordLinkEvent, LoginOTPEvent, MakeRightChoiceEvent, PasswordResetEvent,CarrerEvent } from "../../services/eventBus/events";
import { propertiesService } from "../../services/propertiesService";
import { getContextPool } from "../../tenant-context";
import * as repo from "./common.repository";
import * as adminRepo from "../administration/administration.repository";

async function getAppUrl(tenantPool?: pkg.Pool): Promise<string> {
  const p = tenantPool || getContextPool();
  if (p) {
    try {
      const result = await p.query(
        `SELECT prop_value FROM dbo.am_property_mst WHERE prop_code = 'APP_URL' LIMIT 1`
      );
      const url = (result.rows[0]?.prop_value || '').trim().replace(/\/+$/, '');
      if (url) return url;
    } catch { /* fall through to master */ }
  }
  return propertiesService.getAppUrl();
}

function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

export class CommonService 
{
  async loginUser(email: string, password: string, role?: string, tenantPool?: pkg.Pool) {
    const user = await repo.findUserByUsername(email, tenantPool);
    if (!user) {
      return { error: "Invalid email or password", status: 401 };
    }

    if (String(user.user_status) !== "1") {
      return { error: "Account is inactive. Please contact administrator.", status: 401 };
    }

    const maxAttempts = 3;
    if (user.failed_attempt >= maxAttempts && user.lock_time) {
      const now = new Date();
      const lockoutTime = new Date(user.lock_time.getTime() + 60 * 60 * 1000);
      if (now < lockoutTime) {
        const remainingMinutes = Math.ceil((lockoutTime.getTime() - now.getTime()) / (60 * 1000));
        return {
          error: `Account temporarily locked. Try again in ${remainingMinutes} minutes.`,
          status: 429
        };
      } else {
        await repo.resetFailedLoginAttempts(user.id, tenantPool);
      }
    }

    try {
      const isValidPassword = await argon2.verify(user.password || "", password);
      if (!isValidPassword) {
        await repo.incrementFailedLoginAttempts(user.id, tenantPool);
        return { error: "Invalid email or password", status: 401 };
      }
      await repo.resetFailedLoginAttempts(user.id, tenantPool);
    } catch {
      return { error: "Invalid email or password", status: 401 };
    }

    try {
      await repo.updateLastLoginDate(user.id, tenantPool);
    } catch (updateError) {
      console.error("Failed to update last_login_date for user", user.id, updateError);
      // continue login even if timestamp update fails
    }

    return this.buildLoginResult(user, tenantPool);
  }

  /**
   * Resolves role, vendor/staff determination, org/supplier mapping, and builds
   * the sessionData/responseData pair. Shared by password login (after
   * credential/lockout checks) and SSO login (after the provider's email is
   * matched to an existing user) so both paths produce identical claims.
   */
  async buildLoginResult(user: Record<string, any>, tenantPool?: pkg.Pool) {
    const roleData = await repo.findRoleByUserId(user.id, tenantPool);
    const userRole = roleData?.role_name || "ROLE_USER";
    const roleDisplayName = roleData?.role_display_name || "User";
    let orgIds: number[] = [];
    let orgIdsStr = "";
    const isSupplierRole = ["ROLE_SUPPLIER_ADMIN", "ROLE_SUPPLIER_USER"].includes(userRole);
    const isVendor = user.user_type === 1 || user.org_type === "EXTERNAL" || isSupplierRole;
    const determinedRole = isVendor ? "vendor" : "staff";

    let supplierId: string | null = null;
    let vendorStatus: string | null = null;
    if (isVendor) {
      const supplierMap = await repo.findSupplierMapping(user.id, tenantPool);
      supplierId = supplierMap?.supplier_id?.toString() || null;

      if (supplierId) {
        vendorStatus = await repo.findPrevSupplierStatus(parseInt(supplierId), tenantPool);
      }
    }
    else
    {
      const p = tenantPool || getContextPool();
      if (p) {
        const orgData = await p.query(
          `SELECT org_id FROM dbo.um_user_org_map_dtls WHERE user_id = $1`,
          [user.id]
        );
        if (orgData.rows.length > 0) {
          orgIdsStr = orgData.rows.map((r: any) => r.org_id).join(",");
        }
      } else {
        const orgData = await db
          .select()
          .from(umOrgMapDtls)
          .where(eq(umOrgMapDtls.userId, user.id));
        if (orgData.length > 0) {
          orgIdsStr = orgData.map(org => org.orgId).join(",");
        }
      }
    }
    const sessionData = {
      id: user.id.toString(),
      email: user.email_id,
      name: user.name,
      userName: user.user_name,
      userRole: userRole,
      roleDisplayName: roleDisplayName,
      userType: user.user_type,
      orgId: user.org_id?.toString() || "",
      supplierId: supplierId || "",
      vendorStatus: vendorStatus || "",
      orgIds:orgIdsStr,
      department: user.department_name
    };

    const responseData = {
      success: true,
      role: determinedRole,
      userId: user.id.toString(),
      email: user.email_id,
      name: user.name,
      userName: user.user_name,
      userRole: userRole,
      roleDisplayName: roleDisplayName,
      organizationName: user.organization_name,
      orgId: user.org_id?.toString(),
      supplierId: supplierId,
      vendorStatus: vendorStatus,
      department: user.department_name,
      designation: user.designation,
      orgType: user.org_type,
      orgIds:orgIdsStr
    };

    return { sessionData, responseData };
  }

  async sendLoginOTP(email: string, tenantPool?: pkg.Pool) {
    const user = await repo.findUserByUsername(email, tenantPool);
    if (!user) {
      return { error: "Invalid email address", status: 400 };
    }

    if (String(user.user_status) !== "1") {
      return { error: "Account is inactive. Please contact administrator.", status: 400 };
    }
      
    const now = new Date();

    const maxAttempts = 3;
    if (user.failed_attempt >= maxAttempts && user.lock_time) {
      const lockoutTime = new Date(user.lock_time.getTime() + 60 * 60 * 1000);
      if (now < lockoutTime) {
        const remainingMinutes = Math.ceil((lockoutTime.getTime() - now.getTime()) / (60 * 1000));
        return {
          error: `Account temporarily locked. Try again in ${remainingMinutes} minutes.`,
          status: 429
        };
      } else {
        await repo.resetFailedLoginAttempts(user.id, tenantPool);
      }
    }

    try {
      const otp = generateOTP();
      await repo.updateUserOTPDetails(user.id, {
        oneTimePassword: otp,
        otpRequestedTime: now,
      }, tenantPool);
      const orgData = await adminRepo.getOrgDetails();
      const event: LoginOTPEvent = {
        eventType: EventTypes.LOGIN_OTP,
        otp: otp,
        emailId: user.email_id,
        userName: user.name || user.user_name,
        loginUserName: user.user_name || user.email_id,
        timestamp: now,
        orgLogoPath: orgData.org_logo_path,
        
      };
      eventBus.publish(event);
      return { responseData: { success: true, message: "OTP sent to registered email address" } };
    } catch {
      return { error: "Invalid email address", status: 400 };
    }
  }

  async loginWithOTP(email: string, otp: string, tenantPool?: pkg.Pool) {
    const user = await repo.findUserByUsername(email, tenantPool);
    if (!user) {
      return { error: "Invalid email address", status: 400 };
    }

    if (String(user.user_status) !== "1") {
      return { error: "Account is inactive. Please contact administrator.", status: 400 };
    }

    const now = new Date();
    if (user.otp_requested_time && user.one_time_password) {
      const otpRequestedTime = new Date(user.otp_requested_time);
      const timeDiff = (now.getTime() - otpRequestedTime.getTime()) / (1000 * 60);

      if (timeDiff > 10) {
        await repo.clearOTPDetails(user.id, tenantPool);
        return { error: "OTP has expired", status: 400 };
      }

      if (Number(user.one_time_password) !== Number(otp)) {
        await repo.incrementFailedLoginAttempts(user.id, tenantPool);
        return { error: "Invalid OTP", status: 400 };
      }
    }
    if (user.otp_requested_time && user.one_time_password && Number(user.one_time_password) === Number(otp)) {
      await repo.resetFailedLoginAttempts(user.id, tenantPool);
      await repo.clearOTPDetails(user.id, tenantPool);
      try {
        await repo.updateLastLoginDate(user.id, tenantPool);
      } catch (updateError) {
        console.error("Failed to update last_login_date for user", user.id, updateError);
        // continue login even if timestamp update fails
      }

      const roleData = await repo.findRoleByUserId(user.id, tenantPool);
      const userRole = roleData?.role_name || "ROLE_USER";
      const roleDisplayName = roleData?.role_display_name || "User";
      const department = user.department_name;
      const orgIdsStr = user.attribute_12 || "";

      const isSupplierRole = ["ROLE_SUPPLIER_ADMIN", "ROLE_SUPPLIER_USER"].includes(userRole);
      const isVendor = user.user_type === 1 || user.org_type === "EXTERNAL" || isSupplierRole;
      const determinedRole = isVendor ? "vendor" : "staff";

      let supplierId: string | null = null;
      let vendorStatus: string | null = null;
      if (isVendor) {
        const supplierMap = await repo.findSupplierMapping(user.id, tenantPool);
        supplierId = supplierMap?.supplier_id?.toString() || null;

        if (supplierId) {
          vendorStatus = await repo.findPrevSupplierStatus(parseInt(supplierId), tenantPool);
        }
      }

      const sessionData = {
        id: user.id.toString(),
        email: user.email_id,
        name: user.name,
        userName: user.user_name,
        userRole: userRole,
        roleDisplayName: roleDisplayName,
        userType: user.user_type,
        orgId: user.org_id?.toString() || "",
        orgIds: orgIdsStr,
        supplierId: supplierId || "",
        vendorStatus: vendorStatus || "",
        department: department,
      };

      const responseData = {
        success: true,
        role: determinedRole,
        userId: user.id.toString(),
        email: user.email_id,
        name: user.name,
        userName: user.user_name,
        userRole: userRole,
        roleDisplayName: roleDisplayName,
        organizationName: user.organization_name,
        orgId: user.org_id?.toString(),
        supplierId: supplierId,
        vendorStatus: vendorStatus,
        department: department,
        designation: user.designation,
        orgType: user.org_type,
      };

      return { sessionData, responseData };
      
    } else {
      await repo.incrementFailedLoginAttempts(user.id, tenantPool);
      return { error: "Invalid OTP", status: 400 };
    }
  }

  async registerVendor(data: {
    companyName: string;
    contactName: string;
    email: string;
    phone: string;
    country?: string;
    designation?: string;
    department?: string;
    password: string;
    invitationId?: string;
    source?: string;
  }) {
    const { companyName, contactName, email, phone, country, designation, department, password, invitationId: reqInvitationId, source: reqSource } = data;

    if (!companyName || !contactName || !email || !phone || !password) {
      return { error: "All required fields must be provided", status: 400 };
    }

    const passwordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+{}\[\]:;<>,.?~\\-]).{8,16}$/;
    if (!passwordRegex.test(password)) {
      return { error: "Password must be 8-16 characters with at least 1 uppercase letter, 1 number, and 1 special character", status: 400 };
    }

    const trimmedEmail = email.trim();
    const trimmedCompany = companyName.trim();
    const trimmedPhone = phone.trim();
    const trimmedContact = contactName.trim();
    let effectiveInvitationId = reqInvitationId ? String(reqInvitationId) : null;
    let source = reqSource || null;

    if (effectiveInvitationId) {
      const inv = await repo.findInvitation(parseInt(effectiveInvitationId));
      if (inv) {
        const invStatus = inv.status;
        if (invStatus && invStatus.toLowerCase() === 'cancelled') {
          return { error: "Your invitation has been cancelled. Please contact Administrator for further processing.", status: 400 };
        }
        if (invStatus && invStatus.toLowerCase() === 'expired') {
          return { error: "Your invitation has expired. Please contact Administrator for further processing.", status: 400 };
        }
      }
    }

    if (await repo.checkUserByUsername(trimmedEmail)) {
      return { error: "UserName/E-MailId already exists, Please provide different UserName/E-MailId.", status: 400 };
    }

    if (await repo.checkUserByMobile(trimmedPhone)) {
      return { error: "Mobile No already exists, Please provide different Mobile No.", status: 400 };
    }

    if (await repo.checkUserByEmail(trimmedEmail)) {
      return { error: "Email Id already exists, Please provide different Email Id.", status: 400 };
    }

    if (!effectiveInvitationId) {
      if (await repo.checkOrgExists(trimmedCompany)) {
        return { error: "Supplier account already created for this Supplier Name!", status: 400 };
      }
    }

    if (!effectiveInvitationId) {
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 5);
      const newInvId = await repo.createInvitation({
        companyName: trimmedCompany,
        email: trimmedEmail,
        endDate,
      });
      effectiveInvitationId = String(newInvId);
      source = 'Direct';
    }

    let orgId: number;
    let existingOrg = null;

    if (effectiveInvitationId && reqInvitationId) {
      existingOrg = await repo.findOrgByName(trimmedCompany);
    }

    if (!existingOrg) {
      const defaults = await repo.findInternalOrgDefaults(country || 'AE');
      orgId = await repo.createOrg({
        name: trimmedCompany,
        country: country || 'AE',
        email: trimmedEmail,
        phone: trimmedPhone,
        currency: defaults.currency || 'AED',
        dateFormat: defaults.date_format || 'DD-MM-YYYY',
        paymentTerms: defaults.default_paymentterms || null,
        tax: defaults.default_tax || null,
      });
    } else {
      orgId = existingOrg.id;
    }

    const suppOrgId = await repo.getSystemOrgId();

    const hashedPassword = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 });

    const newUserId = await repo.createUser({
      userName: trimmedEmail,
      name: trimmedContact,
      email: trimmedEmail,
      hashedPassword,
      phone: trimmedPhone,
      designation: designation || null,
      department: department || null,
      orgId,
      suppOrgId,
      companyName: trimmedCompany,
      invitationId: effectiveInvitationId,
      source,
    });

    await repo.createUserRoleMapping(newUserId, 103, trimmedEmail);

    const suppObj = await repo.findSupplierByCompanyName(trimmedCompany);

    if (suppObj) {
      await repo.createSupplierUserMapping({
        userId: newUserId,
        supplierId: suppObj.supplier_id,
        siteId: suppObj.site_id || null,
        createdBy: trimmedEmail,
      });

      await repo.updateSupplierRegistration(suppObj.supplier_id, parseInt(effectiveInvitationId), trimmedPhone);
      await repo.updateOrgAttribute(orgId, String(suppObj.supplier_id));

      const status = await repo.findSupplierStatus(suppObj.supplier_id);
      if (status?.toLowerCase() === 'active') {
        await repo.updateInvitationStatus(parseInt(effectiveInvitationId), 'Active');
      }
    } else {
      await repo.updateInvitationStatus(parseInt(effectiveInvitationId), 'Account Created');
    }

    return {
      success: true,
      message: "Successfully created portal account. Please Login!",
      userId: newUserId,
    };
  }

  async getDashboardStats() {
    return {
      totalVendors: 0,
      pendingApprovals: 0,
      documentsToReview: 0,
      expiringCertificates: 0,
      vendorsByStatus: { draft: 0, pending: 0, under_review: 0, approved: 0, rejected: 0 },
      recentActivity: [],
    };
  }

  async getProfile(identifier: string) {
    const isNumericId = /^\d+$/.test(identifier);
    const user = await repo.findUserProfile(identifier, isNumericId);
    if (!user) {
      return { error: "User not found", status: 404 };
    }

    const roles = await repo.getUserRoles(user.id);
    const role = await repo.findRoleByUserId(user.id);
    const roleName = role ? role.role_name : "";
    let photoData = null;
    if (user.photo_path) {
      photoData = `data:image/jpeg;base64,${Buffer.from(user.photo_path).toString('base64')}`;
    }

    return {
      ...user,
      photo_path: photoData,
      roles,
      roleName,
    };
  }

  async updateProfile(id: string, data: any, userEmail?: string) {
    if (userEmail) {
      const isOwner = await repo.verifyUserOwnership(id, userEmail);
      if (!isOwner) {
        return { error: "Unauthorized", status: 403 };
      }
    }

    await repo.updateUserProfile(id, {
      name: data.name,
      salutation: data.salutation,
      designation: data.designation,
      department_name: data.department_name,
      mobile_no: data.mobile_no,
      phone_no: data.phone_no,
      mobile_ctry_code: data.mobile_ctry_code,
      phone_ctry_code: data.phone_ctry_code,
      phone_area_code: data.phone_area_code,
      manager_name: data.manager_name,
    });

    return { success: true };
  }

  async changePassword(id: string, currentPassword: string, newPassword: string, userEmail?: string) {
    if (!newPassword || newPassword.length < 8) {
      return { error: "New password must be at least 8 characters", status: 400 };
    }
    const appUrl = await getAppUrl();

    const userRow = await repo.findUserById(id);
    
    if (!userRow) {
      return { error: "User not found", status: 404 };
    }

    if (userEmail && String(id) !== String(userEmail)) {
      return { error: "Unauthorized", status: 403 };
    }

    const isValid = await argon2.verify(userRow.password, currentPassword);
    if (!isValid) {
      return { error: "Current password is incorrect", status: 400 };
    }

    const hashedPassword = await argon2.hash(newPassword);
    await repo.updateUserPassword(id, hashedPassword);
    const orgData = await adminRepo.getOrgDetails();

    const event: ChangePasswordEvent = {
      eventType: EventTypes.PROFILE_CHANGE_PASSWORD,
      timestamp: new Date(),
      date: new Date().toLocaleDateString(),
      time: new Date().toLocaleTimeString(),
      emailId:  userRow.email_id,
      userName: userRow.name || userRow.user_name,
      loginUserName: userRow.user_name || userRow.email_id,
      loginUrl: `${appUrl}/login`,
      orgLogoPath: orgData.org_logo_path,

    };
    eventBus.publish(event);
    console.log(`[Change Password] Password changed for ${userRow.email_id}`);
    return { success: true };
  }

  async forgotPassword(emailId: string, mobileNo?: string, tenantPool?: pkg.Pool) {
    let user;
    if (mobileNo && mobileNo !== '0') {
      user = await repo.findUserByEmailAndMobile(emailId, mobileNo, tenantPool);
    } else {
      user = await repo.findUserByEmail(emailId, tenantPool);
    }
    const pool = tenantPool ?? getContextPool();
    const supplierResult = await pool?.query(
      `SELECT id, company_name, email_id, invitation_id, user_registered, reg_type
       FROM dbo.supp_basic_org_dtls WHERE email_id = $1`,
      [emailId]
    );
    const userRegistered = supplierResult && supplierResult.rows.length > 0 ? supplierResult.rows[0].user_registered : null;
    if (userRegistered && userRegistered === 'No' && !user) {
      return { error: "User Account not created for the provided email ID. Please use the invitation link to create your account!", status: 400 };
    }else if (!user) {
      return { error: "Invalid Credentials provided!", status: 400 };
    }

    if (user.last_email_date) {
      const diffMs = new Date().getTime() - new Date(user.last_email_date).getTime();
      if (diffMs / (1000 * 60) < 30) {
        return { error: "Email already sent to your registered email ID. Please try after 30 mins.", status: 429 };
      }
    }

    const rId = uuidv4();
    const appUrl = await getAppUrl(tenantPool);
    const encStr = Buffer.from(`user_id=${user.user_name}~linkId=${rId}`).toString('base64');
    const resetLinkUrl = `${appUrl}/resetpassword?enc=${encodeURIComponent(encStr)}`;

    await repo.updateForgotPasswordToken(user.id, rId, tenantPool);
    const orgData = await adminRepo.getOrgDetails();

    const event: ForgotPasswordLinkEvent = {
      eventType: EventTypes.FORGOT_PASSWORD_LINK,
      timestamp: new Date(),
      emailId: user.email_id,
      userName: user.name || user.user_name,
      loginUserName: user.user_name || user.email_id,
      resetLinkUrl,
      orgLogoPath: orgData.org_logo_path,

    };

    eventBus.publish(event);

    return {
      success: true,
      message: "Email is sent to your registered email id for resetting the password. Please follow instructions provided!",
    };
  }

  async resetPasswordViaLink(userName: string, randomId: string, newPassword: string, tenantPool?: pkg.Pool) {
    const passwordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+{}\[\]:;<>,.?~\\-]).{8,16}$/;
    if (!passwordRegex.test(newPassword)) {
      return { error: "Password must be 8-16 characters with at least 1 uppercase, 1 number, and 1 special character", status: 400 };
    }

    const user = await repo.findUserByUsername(userName, tenantPool);
    if (!user) {
      return { error: "Invalid reset link. Please request a new one.", status: 400 };
    }

    if (!user.attribute_10 || user.attribute_10 !== randomId) {
      return { error: "Invalid or expired reset link. Please request a new one.", status: 400 };
    }

    // Token expires after 24 hours
    /*if (user.last_email_date) {
      const diffMs = new Date().getTime() - new Date(user.last_email_date).getTime();
      if (diffMs > 24 * 60 * 60 * 1000) {
        return { error: "Reset link has expired. Please request a new one.", status: 400 };
      }
    }*/

    const hashedPassword = await argon2.hash(newPassword, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    await repo.updateUserPassword(String(user.id), hashedPassword, tenantPool);
    await repo.clearForgotPasswordToken(user.id, tenantPool);

    return { success: true, message: "Password updated successfully. You can now sign in with your new password." };
  }

  async resetPassword(id: string, tenantDomain?: string) {
    const user = await repo.findUserById(id);
    if (!user) {
      return { error: "User not found", status: 404 };
    }

    const rId = uuidv4();
    const appUrl = await getAppUrl();
    const domainPart = tenantDomain ? `~domain=${tenantDomain}` : '';
    const encStr = Buffer.from(`user_id=${user.user_name}~linkId=${rId}${domainPart}`).toString('base64');
    const resetLinkUrl = `${appUrl}/resetpassword?enc=${encodeURIComponent(encStr)}`;

    await repo.updateForgotPasswordToken(user.id, rId);
    const orgData = await adminRepo.getOrgDetails();
    const event: PasswordResetEvent = {
      eventType: EventTypes.RESET_PASSWORD,
      timestamp: new Date(),
      emailId: user.email_id,
      userName: user.name || user.user_name,
      loginUserName: user.user_name || user.email_id,
      loginUrl: `${appUrl}/login`,
      resetLinkUrl,
      orgName: 'S2P Labs',
      orgLogoPath: orgData.org_logo_path,
    };

    eventBus.publish(event);
    console.log(`[Admin Reset Password] Reset link sent to ${user.email_id}`);

    return {
      success: true,
      message: "Password reset successfully. An email has been sent to the user with the new password.",
    };
  }

  async uploadPhoto(id: string, photo: string) {
    if (!photo) {
      return { error: "No photo provided", status: 400 };
    }

    const exists = await repo.userExists(id);
    if (!exists) {
      return { error: "User not found", status: 404 };
    }

    const validFormats = ['data:image/jpeg', 'data:image/png', 'data:image/gif', 'data:image/webp'];
    const isValidFormat = validFormats.some(format => photo.startsWith(format));
    if (!isValidFormat) {
      return { error: "Invalid image format. Please upload JPEG, PNG, GIF, or WebP", status: 400 };
    }

    const base64Data = photo.replace(/^data:image\/\w+;base64,/, '');
    const photoBuffer = Buffer.from(base64Data, 'base64');

    if (photoBuffer.length > 5 * 1024 * 1024) {
      return { error: "Photo must be less than 5MB", status: 400 };
    }

    await repo.updateProfilePhoto(id, photoBuffer);
    return { success: true };
  }

  async removePhoto(id: string) {
    const exists = await repo.userExists(id);
    if (!exists) {
      return { error: "User not found", status: 404 };
    }

    await repo.removeProfilePhoto(id);
    return { success: true };
  }

  async submitFeedback(userId: string, data: {
    feedbackType: string;
    feedbackAbout: string;
    department: string;
    feedbackMsg: string;
    isConveyed?: string;
    conveyedTo?: string;
    suggestion?: string;
  }) {
    if (!data.feedbackType || !data.feedbackAbout || !data.department || !data.feedbackMsg) {
      return { error: "All required fields must be provided", status: 400 };
    }

    const userInfo = await repo.getUserEmailAndName(userId);
    const userEmail = userInfo?.email_id || userId;
    const userName = userInfo?.name || 'Unknown User';

    const sanitizedMsg = data.feedbackMsg.replace(/<[^>]*>/g, '');
    const sanitizedSuggestion = data.suggestion ? data.suggestion.replace(/<[^>]*>/g, '') : null;

    const id = await repo.createFeedback({
      feedbackType: data.feedbackType,
      feedbackAbout: data.feedbackAbout,
      department: data.department,
      feedbackMsg: sanitizedMsg,
      suggestion: sanitizedSuggestion,
      isConveyed: data.isConveyed || 'N',
      conveyedTo: data.conveyedTo || null,
      userEmail,
      userName,
    });

    return { success: true, id };
  }

  async getFeedbackHistory(userId: string) {
    return repo.getFeedbackHistory();
  }

  async getDepartments() {
    return repo.getDepartments();
  }

  async getUserMenu(userId: string, supplierId?: string) {
    const rows = await repo.getUserMenuFunctions(userId);

    const grouped: Record<string, any[]> = {};
    for (const row of rows) {
      const module = row.module_name || 'Other';
      if (!grouped[module]) grouped[module] = [];
      grouped[module].push({
        id: row.id,
        functionName: row.function_name,
        description: row.description,
        url: row.function_url,
        category: row.category,
        iconName: row.icon_name,
        parentId: row.parent_function_id ?? null,
      });
    }

    return { ...grouped, _meta: { supplierId: supplierId || null } };
  }

  async getDashboardInbox(user: any, pageNo: number, pageSize: number) {
    const userRoles = await repo.getUserRoleNames(user.id);
    const isSuperAdmin = userRoles.includes('SUPERADMIN') || userRoles.includes('ROLE_SUPERADMIN');
    const { workflowService } = await import("../../services/workflowService");
    const { getBidTasks } = await import("../bids/bids.service");
    const { getContractReviewTasks } = await import("../contracts/contracts.service");

    const [wfTasks, bidTasks, contractReviewTasks] = await Promise.all([
      workflowService.getInbox(user.user_name || user.userName, userRoles, pageNo, pageSize),
      getBidTasks(Number(user.id), isSuperAdmin).catch(() => []),
      getContractReviewTasks(Number(user.id), isSuperAdmin).catch(() => []),
    ]);

    const bidTaskCount = bidTasks.length + contractReviewTasks.length;
    const wfTotalRecords = wfTasks.length > 0 ? (wfTasks[0] as any).totalRecords || 0 : 0;
    const totalRecords = wfTotalRecords + bidTaskCount;

    const combined = [...wfTasks, ...bidTasks, ...contractReviewTasks].map((t: any) => ({ ...t, totalRecords }));
    combined.sort((a: any, b: any) => {
      const da = new Date(a.inboxDate || a.create_time_ || 0).getTime();
      const db = new Date(b.inboxDate || b.create_time_ || 0).getTime();
      return db - da;
    });

    return combined;
  }

  async getInboxDash(user: any) {
    const userRoles = await repo.getUserRoleNames(user.id);
    const isSuperAdmin = userRoles.includes('SUPERADMIN') || userRoles.includes('ROLE_SUPERADMIN');
    const { workflowService } = await import("../../services/workflowService");
    const { getBidTasks } = await import("../bids/bids.service");
    const { getContractReviewTasks } = await import("../contracts/contracts.service");

    const [wfTasks, bidTasks, contractReviewTasks] = await Promise.all([
      workflowService.getInboxDash(user.userName || user.user_name, userRoles),
      getBidTasks(Number(user.id), isSuperAdmin).catch(() => []),
      getContractReviewTasks(Number(user.id), isSuperAdmin).catch(() => []),
    ]);

    const combined = [...wfTasks, ...bidTasks, ...contractReviewTasks];
    combined.sort((a: any, b: any) => {
      const da = new Date(a.inboxDate || a.create_time_ || 0).getTime();
      const db = new Date(b.inboxDate || b.create_time_ || 0).getTime();
      return db - da;
    });

    return combined;
  }

  async getAllTasks(user: any, pageNo: number, pageSize: number) {
    const userDetails = await repo.getUserDetails(String(user.id));
    const orgId = userDetails?.org_id || "";
    const userRoles = await repo.getUserRoleNames(user.id);

    const orgIds = orgId ? orgId.split(",") : [];

    const isSuperAdmin = userRoles.includes('SUPERADMIN') || userRoles.includes('ROLE_SUPERADMIN');

    const userIdentifiers: string[] = [];
    if (userDetails?.user_name) userIdentifiers.push(userDetails.user_name);
    if (userDetails?.email_id && userDetails.email_id !== userDetails.user_name) userIdentifiers.push(userDetails.email_id);

    const { workflowService } = await import("../../services/workflowService");
    const { getBidTasks } = await import("../bids/bids.service");
    const { getContractReviewTasks } = await import("../contracts/contracts.service");

    const [tasksData, bidTasks, contractReviewTasks] = await Promise.all([
      workflowService.getAllTasks(pageNo, pageSize, userIdentifiers, userRoles, isSuperAdmin, orgIds.map(Number)),
      pageNo === 0 ? getBidTasks(Number(user.id), isSuperAdmin).catch(() => []) : Promise.resolve([]),
      pageNo === 0 ? getContractReviewTasks(Number(user.id), isSuperAdmin).catch(() => []) : Promise.resolve([]),
    ]);

    const wfTotal = tasksData.length > 0 ? (tasksData[0] as any).totalRecords || 0 : 0;
    const total = wfTotal + bidTasks.length + contractReviewTasks.length;

    const combined = [...bidTasks, ...contractReviewTasks, ...tasksData].map((t: any) => ({ ...t, totalRecords: total }));
    combined.sort((a: any, b: any) => {
      const da = new Date(a.inboxDate || a.create_time_ || 0).getTime();
      const db = new Date(b.inboxDate || b.create_time_ || 0).getTime();
      return db - da;
    });

    return { tasks: combined, total };
  }

  async getInboxCount(user: any) {
    const userRoles = await repo.getUserRoleNames(user.id);
    const isSuperAdmin = userRoles.includes('SUPERADMIN') || userRoles.includes('ROLE_SUPERADMIN');
    const { workflowService } = await import("../../services/workflowService");
    const { getBidTasks } = await import("../bids/bids.service");
    const { getContractReviewTasks } = await import("../contracts/contracts.service");

    const [wfCount, bidTasks, contractReviewTasks] = await Promise.all([
      workflowService.getInboxCount(user.userName || user.user_name, userRoles),
      getBidTasks(Number(user.id), isSuperAdmin).catch(() => []),
      getContractReviewTasks(Number(user.id), isSuperAdmin).catch(() => []),
    ]);

    return wfCount + bidTasks.length + contractReviewTasks.length;
  }

  async getPendingApprovals(user: any) {
    const { workflowService } = await import("../../services/workflowService");
    const userRoles = await repo.getUserRoleNames(user.id);
    const isSuperAdmin =
      userRoles.includes("SUPERADMIN") ||
      userRoles.includes("ROLE_SUPERADMIN") ||
      userRoles.includes("ROLE_SYSADMIN");
    const userDetails = await repo.getUserDetails(String(user.id));

    const userIdentifiers: string[] = [];
    if (userDetails?.user_name) userIdentifiers.push(userDetails.user_name);
    if (userDetails?.email_id && userDetails.email_id !== userDetails.user_name) {
      userIdentifiers.push(userDetails.email_id);
    }

    return workflowService.getPendingApprovalCounts(
      userIdentifiers,
      userRoles,
      isSuperAdmin,
    );
  }

  async getUserCounts() {
    return repo.getUserCounts();
  }

  async getSupplierStats(supplierId: string) {
    return repo.getSupplierStats(supplierId);
  }

  async getSupplierActivities(supplierId: string) {
    return repo.getSupplierActivities(supplierId);
  }

  async getRecentActivities(user: any) {
    const userDetails = await repo.getUserDetails(String(user.id));
    const username = userDetails?.name ||userDetails?.user_name || userDetails?.email_id || '';
    return repo.getRecentActivities(username, 5);
  }

  async getMyRequestStats(user: any) {
    const userRoles = await repo.getUserRoleNames(user.id);
    const isSuperAdmin = userRoles.includes('SUPERADMIN') || userRoles.includes('ROLE_SUPERADMIN');
    const userDetails = await repo.getUserDetails(String(user.id));
    const username = userDetails?.user_name || userDetails?.email_id || '';

    if (isSuperAdmin) {
      return repo.getAllRequestStats();
    }
    const emailId = userDetails?.email_id || '';
    return repo.getMyRequestStats(username, String(user.id), emailId);
  }

  async getAvailableBudgets() {
    return repo.getAvailableBudgets(5);
  }

  async getRecentComments(user: any) {
    const userRoles = await repo.getUserRoleNames(user.id);
    const isSuperAdmin = userRoles.includes('SUPERADMIN') || userRoles.includes('ROLE_SUPERADMIN');
    const userDetails = await repo.getUserDetails(String(user.id));
    const username = userDetails?.user_name || userDetails?.email_id || '';

    if (isSuperAdmin) {
      return repo.getAllRecentComments(5);
    }
    return repo.getRecentComments(username, 5);
  }

  async contactUs(user: string, companyName: string,Firstname: string, email: string, mobile: string, message: string,lastName: string,contactUs: string) 
  {
    let event="";
    if(contactUs.includes("Supplier") || contactUs.includes("supplier")) {
				event="CONTACT_US_SUPPLIER";
			} else if (contactUs.includes("Buyer") || contactUs.includes("buyer") ){
				event="CONTACT_US_BUYER";
			} else {
				event="CONTACT_US_SALES";
			}

  const eventData: ContactUsEvent = 
  {
      eventType: event,
      timestamp: new Date(),
      emailId:  email,
      userName: "prokrayateam@gmail.com",
      fullName: Firstname + " " + lastName,
      companyName: companyName,
      mobileNumber: mobile,
      message: message,
      contactReason: contactUs,
      user: user,
      loginUserName: "S2P Labs Team",
    };
    eventBus.publish(eventData);
  }

 async makeRightChoice(params: { user: string; companyName: any; contactName: any; email: any; mobile: any; message: any; }) 
 {
    const eventData: MakeRightChoiceEvent = 
    {
    eventType: "MAKE_RIGHT_CHOICE",
    timestamp: new Date(),
    companyName: params.companyName,
    contactName: params.contactName,
    emailId: params.email,
    mobileNumber: params.mobile,
    message: params.message,
    userName: "prokrayateam@gmail.com",
    loginUserName: "S2P Labs Team",
    user: params.user,
    };
    eventBus.publish(eventData);  

    const choiceEvent: MakeRightChoiceEvent = 
    {
    eventType: "MAKE_RIGHT_CHOICE",
    timestamp: new Date(),
    companyName: params.companyName,
    contactName: params.contactName,
    emailId: params.email,
    mobileNumber: params.mobile,
    message: params.message,
    userName: "prokrayateam@gmail.com",
    loginUserName: "S2P Labs Team",
    user: params.user,
    };
    eventBus.publish(choiceEvent);
  }

  async submitCareerForm(career: any, uploadedFile: Express.Multer.File | undefined) 
  {
   const carrerEvent: CarrerEvent = 
   {
    eventType: "CAREER_SUBMISSION",
    timestamp: new Date(),
    contactName: career.contactName,
    emailId: career.email,
    mobileNumber: career.mobile,
    message: career.message,
    user: career.user ?? "S2P Labs Team",
    position: career.position,
  };
    eventBus.publish(carrerEvent);

    const carrerEvent1: CarrerEvent = 
   {
    eventType: "CAREER_CONFIRMATION",
    timestamp: new Date(),
    contactName: career.contactName,
    emailId: career.email,
    mobileNumber: career.mobile,
    message: career.message,
    user: career.user ?? "S2P Labs Team",
    position: career.position,
  };
    eventBus.publish(carrerEvent1);
  }
}