import { EDITABLE_STATUSES } from "server/constants";

export function validateIsEditable(check: any, status: string,moduleName: string) {
      if (!check) {
    throw { status: 404, message: `${moduleName} not found` };
  }
  const normalizedStatus = status.toLowerCase().trim();
   if (!EDITABLE_STATUSES.includes(normalizedStatus as any)) {
    throw { 
      status: 400, 
      message: `${moduleName} must be in draft or more info required status to perform this operation` 
    };
  }
}
