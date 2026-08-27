import {
  dboPmCatCategories,
  dboProductMaster,
  dboSupplierApprovalHistory,
  dboSupplierBanks,
  dboSupplierContacts,
  dboSupplierDocuments,
  dboSupplierRefCompanies,
  dboSuppliers,
  dboSupplierServices,
  dboCatCategories,
  type Category,
  type DboProductMaster,
  type DboSupplier,
  type DboSupplierApprovalHistory,
  type DboSupplierBank,
  type DboSupplierContact,
  type DboSupplierDocument,
  type DboSupplierRefCompany,
  type DboSupplierService,
  type InsertCategory,
  type InsertItem,
  type InsertUser,
  type Item,
  type ItemWithSpecs,
  type User
} from "@shared/schema";
import { randomUUID } from "crypto";
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db, pool } from "./db";
import { getContextDb, getContextPool } from "./tenant-context";
import { SupplierRankEngine } from "./services/supplier-rank";
const getDb = () => getContextDb() ?? db;
const getPool = () => getContextPool() ?? pool;

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // DBO Suppliers (Production Vendor Data)
  getDboSuppliers(): Promise<DboSupplier[]>;
  getDboSuppliersPaginated(params: { page: number; limit: number; status?: string; search?: string }): Promise<{ data: DboSupplier[]; pagination: { page: number; limit: number; total: number; totalPages: number }; statusCounts: Record<string, number> }>;
  searchDboSuppliersForAgent(params: { query: string; limit?: number }): Promise<Array<{ id: number; companyName: string | null; emailId: string | null; supplierId: string | null }>>;
  listDboSuppliersForAgentBrowse(params: { offset: number; limit: number }): Promise<{
    vendors: Array<{ id: number; companyName: string | null; emailId: string | null; supplierId: string | null }>;
    hasMore: boolean;
  }>;
  getDboSupplier(id: number | string): Promise<DboSupplier | undefined>;
  findDboSupplierByTaxIdentifier(identifier: string): Promise<DboSupplier | undefined>;
  getDboSupplierContacts(supplierId: number): Promise<DboSupplierContact[]>;
  getDboSupplierBanks(supplierId: number): Promise<DboSupplierBank[]>;
  getDboSupplierDocuments(supplierId: number): Promise<DboSupplierDocument[]>;
  getDboSupplierServices(supplierId: number): Promise<DboSupplierService[]>;
  getDboSupplierRefCompanies(supplierId: number): Promise<DboSupplierRefCompany[]>;
  getDboSupplierApprovalHistory(supplierId: number): Promise<DboSupplierApprovalHistory[]>;
  updateDboSupplierStatus(id: number, status: string): Promise<DboSupplier | undefined>;
  // Categories
  getCategories(): Promise<Category[]>;
  getCategoriesByLevel(level: string): Promise<Category[]>;
  getCategoriesByParent(parentCode: string): Promise<Category[]>;
  getCategory(id: string): Promise<Category | undefined>;
  getCategoryByCode(code: string): Promise<Category | undefined>;
  searchCategories(query: string): Promise<Category[]>;
  createCategory(category: InsertCategory): Promise<Category>;
  updateCategory(id: string, updates: Partial<Category>): Promise<Category | undefined>;
  deleteCategory(id: string): Promise<boolean>;
  // Items (Item Master)
  getItems(): Promise<ItemWithSpecs[]>;
  getItemsPaginated(options: {
    page: number;
    limit: number;
    search?: string;
    category?: string;
    status?: string;
  }): Promise<{ items: ItemWithSpecs[]; total: number; page: number; limit: number; totalPages: number }>;
  getItemCategoryStats(filters?: { search?: string; status?: string; category?: string }): Promise<{ categoryName: string; categoryCode: string; count: number }[]>;
  getUncategorizedItemCount(filters?: { search?: string; status?: string; category?: string }): Promise<number>;
  getMissingSkuCount(filters?: { search?: string; status?: string; category?: string }): Promise<number>;
  getItemsByCategory(categoryCode: string): Promise<ItemWithSpecs[]>;
  getItem(id: string): Promise<ItemWithSpecs | undefined>;
  getItemByCode(itemCode: string): Promise<ItemWithSpecs | undefined>;
  searchItems(query: string): Promise<ItemWithSpecs[]>;
  createItem(item: InsertItem): Promise<ItemWithSpecs>;
  updateItem(id: string, updates: Partial<ItemWithSpecs>): Promise<ItemWithSpecs | undefined>;
  deleteItem(id: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private categories: Map<string, Category>;
  private items: Map<string, Item>;
  private itemCounter: number;

  constructor() {
    this.users = new Map();
    this.categories = new Map();
    this.items = new Map();
    this.itemCounter = 10000;
  }

  private seedCategories() {
    // Seed categories (UNSPSC-based hierarchy - 217 categories: 15 segments, 51 families, 151 commodities)
    const now = new Date().toISOString();
    const categoryData: Array<{ code: string; name: string; level: string; parentCode: string | null; description: string }> = [
      // ============== SEGMENTS (15 total - 2 digit codes) ==============
      { code: "43", name: "IT & Broadcasting", level: "segment", parentCode: null, description: "Information technology and broadcasting equipment" },
      { code: "44", name: "Office Equipment", level: "segment", parentCode: null, description: "Office equipment and supplies" },
      { code: "80", name: "Professional Services", level: "segment", parentCode: null, description: "Management and business professional services" },
      { code: "82", name: "Marketing & Advertising", level: "segment", parentCode: null, description: "Marketing, advertising, and event services" },
      { code: "76", name: "Facilities Management", level: "segment", parentCode: null, description: "Facilities and property management" },
      { code: "78", name: "Travel & Logistics", level: "segment", parentCode: null, description: "Travel, transportation, and logistics" },
      { code: "84", name: "Financial Services", level: "segment", parentCode: null, description: "Banking, insurance, and financial services" },
      { code: "39", name: "Electrical & HVAC", level: "segment", parentCode: null, description: "Electrical and HVAC equipment and services" },
      { code: "50", name: "Food & Catering", level: "segment", parentCode: null, description: "Food, beverages, and catering services" },
      { code: "85", name: "Healthcare & Safety", level: "segment", parentCode: null, description: "Healthcare and safety services" },
      { code: "55", name: "Media & Publishing", level: "segment", parentCode: null, description: "Media, publishing, and entertainment" },
      { code: "56", name: "Furniture", level: "segment", parentCode: null, description: "Furniture and furnishings" },
      { code: "86", name: "Education & Training", level: "segment", parentCode: null, description: "Education and training services" },
      { code: "46", name: "Apparel & Clothing", level: "segment", parentCode: null, description: "Apparel, clothing, and textiles" },
      { code: "72", name: "Real Estate", level: "segment", parentCode: null, description: "Real estate and construction" },
      // ============== FAMILIES (51 total - 4 digit codes) ==============
      // IT & Broadcasting (43)
      { code: "4321", name: "Computer Hardware", level: "family", parentCode: "43", description: "Computer equipment and accessories" },
      { code: "4322", name: "Software", level: "family", parentCode: "43", description: "Software licenses and applications" },
      { code: "4323", name: "IT Services", level: "family", parentCode: "43", description: "IT consulting, development, and support" },
      { code: "4324", name: "Network Equipment", level: "family", parentCode: "43", description: "Network and security equipment" },
      { code: "4325", name: "Communication Devices", level: "family", parentCode: "43", description: "Phones, communication equipment" },
      // Office Equipment (44)
      { code: "4411", name: "Office Supplies", level: "family", parentCode: "44", description: "General office supplies and stationery" },
      { code: "4412", name: "Office Equipment", level: "family", parentCode: "44", description: "Office machines and equipment" },
      { code: "4413", name: "Stationery", level: "family", parentCode: "44", description: "Paper, pens, and stationery items" },
      // Professional Services (80)
      { code: "8011", name: "Legal Services", level: "family", parentCode: "80", description: "Legal and compliance services" },
      { code: "8012", name: "Accounting Services", level: "family", parentCode: "80", description: "Accounting and audit services" },
      { code: "8013", name: "Management Consulting", level: "family", parentCode: "80", description: "Business and management consulting" },
      { code: "8014", name: "HR Services", level: "family", parentCode: "80", description: "Recruitment and HR services" },
      { code: "8015", name: "Data Services", level: "family", parentCode: "80", description: "Data entry and management services" },
      // Marketing & Advertising (82)
      { code: "8211", name: "Advertising", level: "family", parentCode: "82", description: "Advertising and promotional services" },
      { code: "8212", name: "Marketing Research", level: "family", parentCode: "82", description: "Market research and consultancy" },
      { code: "8213", name: "Event Management", level: "family", parentCode: "82", description: "Events, exhibitions, and conferences" },
      { code: "8214", name: "Corporate Gifts", level: "family", parentCode: "82", description: "Promotional and corporate gifts" },
      // Facilities Management (76)
      { code: "7611", name: "Cleaning Services", level: "family", parentCode: "76", description: "Cleaning and janitorial services" },
      { code: "7612", name: "Security Services", level: "family", parentCode: "76", description: "Security and surveillance services" },
      { code: "7613", name: "Pest Control", level: "family", parentCode: "76", description: "Pest control services" },
      { code: "7614", name: "Waste Management", level: "family", parentCode: "76", description: "Garbage disposal and recycling" },
      // Travel & Logistics (78)
      { code: "7811", name: "Travel Services", level: "family", parentCode: "78", description: "Travel agents and booking services" },
      { code: "7812", name: "Transportation", level: "family", parentCode: "78", description: "Car rental, taxi, and transport" },
      { code: "7813", name: "Logistics", level: "family", parentCode: "78", description: "Courier and logistics services" },
      { code: "7814", name: "Accommodation", level: "family", parentCode: "78", description: "Hotels and lodging facilities" },
      // Financial Services (84)
      { code: "8411", name: "Insurance Services", level: "family", parentCode: "84", description: "Insurance products and services" },
      { code: "8412", name: "Tax Services", level: "family", parentCode: "84", description: "Tax and compliance services" },
      { code: "8413", name: "Credit Services", level: "family", parentCode: "84", description: "Credit rating and financial services" },
      // Electrical & HVAC (39)
      { code: "3911", name: "Electrical Supplies", level: "family", parentCode: "39", description: "Electrical hardware and supplies" },
      { code: "3912", name: "Electrical Services", level: "family", parentCode: "39", description: "Electrical installation and maintenance" },
      { code: "3913", name: "Air Conditioning", level: "family", parentCode: "39", description: "HVAC and air conditioning" },
      { code: "3914", name: "Batteries", level: "family", parentCode: "39", description: "Batteries and accessories" },
      // Food & Catering (50)
      { code: "5011", name: "Catering Services", level: "family", parentCode: "50", description: "Food catering and cafeteria" },
      { code: "5012", name: "Beverages", level: "family", parentCode: "50", description: "Beverages and drinks" },
      { code: "5013", name: "Bakery Products", level: "family", parentCode: "50", description: "Bread and bakery items" },
      { code: "5014", name: "Vending", level: "family", parentCode: "50", description: "Vending machines and services" },
      // Healthcare & Safety (85)
      { code: "8511", name: "Medical Services", level: "family", parentCode: "85", description: "Healthcare and medical services" },
      { code: "8512", name: "Fire Safety", level: "family", parentCode: "85", description: "Fire protection and safety equipment" },
      { code: "8513", name: "Safety Equipment", level: "family", parentCode: "85", description: "Safety and protective equipment" },
      // Media & Publishing (55)
      { code: "5511", name: "Film Production", level: "family", parentCode: "55", description: "Film and video production" },
      { code: "5512", name: "Photography", level: "family", parentCode: "55", description: "Photography equipment and services" },
      { code: "5513", name: "Publishing", level: "family", parentCode: "55", description: "Books, newspapers, and publications" },
      { code: "5514", name: "News Services", level: "family", parentCode: "55", description: "News and media services" },
      // Furniture (56)
      { code: "5611", name: "Office Furniture", level: "family", parentCode: "56", description: "Office furniture and fixtures" },
      { code: "5612", name: "Household Items", level: "family", parentCode: "56", description: "Household furniture and items" },
      { code: "5613", name: "Carpets and Linens", level: "family", parentCode: "56", description: "Carpets, towels, and linens" },

      // Education & Training (86)
      { code: "8611", name: "Training Services", level: "family", parentCode: "86", description: "Education and training services" },
      { code: "8612", name: "Educational Materials", level: "family", parentCode: "86", description: "Educational software and materials" },

      // Apparel & Clothing (46)
      { code: "4611", name: "Clothing", level: "family", parentCode: "46", description: "Apparel and clothing" },

      // Real Estate (72)
      { code: "7211", name: "Real Estate Services", level: "family", parentCode: "72", description: "Real estate and property services" },
      { code: "7212", name: "Building Structures", level: "family", parentCode: "72", description: "Building and construction structures" },

      // ============== COMMODITIES (151 total - 8 digit codes) ==============
      // IT - Computer Hardware (4321)
      { code: "43211501", name: "Computer Equipment and Accessories", level: "commodity", parentCode: "4321", description: "General computer equipment" },
      { code: "43211502", name: "CPU", level: "commodity", parentCode: "4321", description: "Central processing units" },
      { code: "43211503", name: "Processors", level: "commodity", parentCode: "4321", description: "Computer processors" },
      { code: "43211504", name: "Data Cables", level: "commodity", parentCode: "4321", description: "Data and network cables" },
      { code: "43211505", name: "Computer Accessories", level: "commodity", parentCode: "4321", description: "Peripherals and accessories" },
      // IT - Software (4322)
      { code: "43221501", name: "Software Licenses", level: "commodity", parentCode: "4322", description: "Software licensing" },
      { code: "43221502", name: "Tableau", level: "commodity", parentCode: "4322", description: "Data visualization software" },
      { code: "43221503", name: "Anti Virus", level: "commodity", parentCode: "4322", description: "Antivirus software" },
      { code: "43221504", name: "Computer Software Trading", level: "commodity", parentCode: "4322", description: "Software distribution" },
      { code: "43221505", name: "Computer Software Development", level: "commodity", parentCode: "4322", description: "Custom software development" },
      { code: "43221506", name: "Education and Training Computer Software", level: "commodity", parentCode: "4322", description: "Educational software" },
      { code: "43221507", name: "Data Management and Query Software", level: "commodity", parentCode: "4322", description: "Database software" },
      { code: "43221508", name: "Software Maintenance and Support", level: "commodity", parentCode: "4322", description: "Software support services" },
      // IT - IT Services (4323)
      { code: "43231501", name: "IT Services", level: "commodity", parentCode: "4323", description: "General IT services" },
      { code: "43231502", name: "Computer Consultancies", level: "commodity", parentCode: "4323", description: "IT consulting" },
      { code: "43231503", name: "Computer Repairing and Maintenance", level: "commodity", parentCode: "4323", description: "Hardware repair services" },
      { code: "43231504", name: "Computer Graphic Design Services", level: "commodity", parentCode: "4323", description: "Graphics and design" },
      { code: "43231505", name: "IT Infrastructure", level: "commodity", parentCode: "4323", description: "Infrastructure services" },
      { code: "43231506", name: "Information Technology Consultants", level: "commodity", parentCode: "4323", description: "IT advisory" },
      { code: "43231507", name: "Management Information Systems MIS", level: "commodity", parentCode: "4323", description: "MIS services" },

      // IT - Network (4324)
      { code: "43241501", name: "Network Security Equipment", level: "commodity", parentCode: "4324", description: "Security hardware" },
      { code: "43241502", name: "Media Storage Device Accessories", level: "commodity", parentCode: "4324", description: "Storage accessories" },

      // IT - Communication (4325)
      { code: "43251501", name: "Communications Devices and Accessories", level: "commodity", parentCode: "4325", description: "Communication equipment" },
      { code: "43251502", name: "Phones and Mobile Phone Repair", level: "commodity", parentCode: "4325", description: "Phone repair services" },
      { code: "43251503", name: "Call Management Systems or Accessories", level: "commodity", parentCode: "4325", description: "Call center equipment" },
      { code: "43251504", name: "Telecommunication Services", level: "commodity", parentCode: "4325", description: "Telecom services" },
      { code: "43251505", name: "Barcode Services", level: "commodity", parentCode: "4325", description: "Barcode systems" },
      // Office Supplies (4411)
      { code: "44111501", name: "Office Supplies", level: "commodity", parentCode: "4411", description: "General office supplies" },
      { code: "44111502", name: "Stationary", level: "commodity", parentCode: "4411", description: "Stationery items" },
      { code: "44111503", name: "Toilet Paper", level: "commodity", parentCode: "4411", description: "Bathroom supplies" },
      { code: "44111504", name: "Office Chairs", level: "commodity", parentCode: "4411", description: "Office seating" },
      { code: "44111505", name: "Newsprint and Offset Papers", level: "commodity", parentCode: "4411", description: "Paper products" },
      // Office Equipment (4412)
      { code: "44121501", name: "Binding and Lamination Machines", level: "commodity", parentCode: "4412", description: "Document processing equipment" },
      { code: "44121502", name: "Photocopiers Repairing and Maintenance", level: "commodity", parentCode: "4412", description: "Copier services" },
      { code: "44121503", name: "Office Time Recording Machines", level: "commodity", parentCode: "4412", description: "Attendance equipment" },
      { code: "44121504", name: "Stamp and Seal Making", level: "commodity", parentCode: "4412", description: "Office stamps" },
      // Legal Services (8011)
      { code: "80111501", name: "Legal Services", level: "commodity", parentCode: "8011", description: "Legal counsel and services" },
      { code: "80111502", name: "Customs Administration and Compliance", level: "commodity", parentCode: "8011", description: "Customs services" },
      { code: "80111503", name: "Government Liaison Office", level: "commodity", parentCode: "8011", description: "Government relations" },
      { code: "80111504", name: "Document Inspection and Forgery Detection", level: "commodity", parentCode: "8011", description: "Document verification" },
      { code: "80111505", name: "Documents and Data Verification Services", level: "commodity", parentCode: "8011", description: "Verification services" },
      // Accounting Services (8012)
      { code: "80121501", name: "Accounting and Auditing Services", level: "commodity", parentCode: "8012", description: "Accounting services" },
      { code: "80121502", name: "Audit Services", level: "commodity", parentCode: "8012", description: "Audit services" },
      { code: "80121503", name: "Corporate Finance", level: "commodity", parentCode: "8012", description: "Financial services" },
      // Management Consulting (8013)
      { code: "80131501", name: "Management Consultancies", level: "commodity", parentCode: "8013", description: "Management consulting" },
      { code: "80131502", name: "Sourcing and Procurement Consultant", level: "commodity", parentCode: "8013", description: "Procurement consulting" },
      { code: "80131503", name: "Logistics Consultancy", level: "commodity", parentCode: "8013", description: "Logistics consulting" },
      // HR Services (8014)
      { code: "80141501", name: "Recruitment Services", level: "commodity", parentCode: "8014", description: "Staffing and recruitment" },
      { code: "80141502", name: "Labour Hire", level: "commodity", parentCode: "8014", description: "Labour supply" },
      { code: "80141503", name: "Call Centers Services", level: "commodity", parentCode: "8014", description: "Call center staffing" },
      { code: "80141504", name: "Customer Care Center", level: "commodity", parentCode: "8014", description: "Customer service staffing" },

      // Data Services (8015)
      { code: "80151501", name: "Data Entry Services", level: "commodity", parentCode: "8015", description: "Data entry" },

      // Advertising (8211)
      { code: "82111501", name: "Advertising Agency", level: "commodity", parentCode: "8211", description: "Advertising services" },
      { code: "82111502", name: "Advertising Sign Boards Installation", level: "commodity", parentCode: "8211", description: "Signage installation" },
      { code: "82111503", name: "Signage", level: "commodity", parentCode: "8211", description: "Signs and displays" },
      { code: "82111504", name: "Newspaper Advertisements", level: "commodity", parentCode: "8211", description: "Print advertising" },

      // Marketing Research (8212)
      { code: "82121501", name: "Marketing", level: "commodity", parentCode: "8212", description: "Marketing services" },
      { code: "82121502", name: "Marketing Research and Consultancies", level: "commodity", parentCode: "8212", description: "Market research" },

      // Event Management (8213)
      { code: "82131501", name: "Conferences and Seminars Organizing", level: "commodity", parentCode: "8213", description: "Conference services" },
      { code: "82131502", name: "Event Management", level: "commodity", parentCode: "8213", description: "Event planning" },
      { code: "82131503", name: "Exhibition Organizing", level: "commodity", parentCode: "8213", description: "Exhibition services" },
      { code: "82131504", name: "Exhibition Stand Fitting and Execution", level: "commodity", parentCode: "8213", description: "Exhibition setup" },
      { code: "82131505", name: "Meeting Facilities", level: "commodity", parentCode: "8213", description: "Meeting venue services" },

      // Corporate Gifts (8214)
      { code: "82141501", name: "Corporate Gifts", level: "commodity", parentCode: "8214", description: "Promotional gifts" },

      // Cleaning Services (7611)
      { code: "76111501", name: "Cleaning and Janitorial Services", level: "commodity", parentCode: "7611", description: "Cleaning services" },
      { code: "76111502", name: "Cleaning and Janitorial Supplies", level: "commodity", parentCode: "7611", description: "Cleaning supplies" },
      { code: "76111503", name: "Cleaning Equipment", level: "commodity", parentCode: "7611", description: "Cleaning machines" },
      { code: "76111504", name: "Cleaning Equipment Accessories", level: "commodity", parentCode: "7611", description: "Cleaning accessories" },
      { code: "76111505", name: "Cleaning Rags and Cloths and Wipes", level: "commodity", parentCode: "7611", description: "Cleaning materials" },
      { code: "76111506", name: "Brooms and Mops and Brushes", level: "commodity", parentCode: "7611", description: "Cleaning tools" },
      { code: "76111507", name: "Car Washing and Cleaning", level: "commodity", parentCode: "7611", description: "Vehicle cleaning" },
      // Security Services (7612)
      { code: "76121501", name: "Security and Surveillance Services", level: "commodity", parentCode: "7612", description: "Security services" },
      { code: "76121502", name: "Security Control and Alarm Equipment Trading", level: "commodity", parentCode: "7612", description: "Alarm systems" },
      { code: "76121503", name: "Security Devices Equipment Trading", level: "commodity", parentCode: "7612", description: "Security devices" },
      { code: "76121504", name: "Security Systems Inspection Services", level: "commodity", parentCode: "7612", description: "Security inspection" },

      // Pest Control (7613)
      { code: "76131501", name: "Pest Control", level: "commodity", parentCode: "7613", description: "Pest control services" },

      // Waste Management (7614)
      { code: "76141501", name: "Garbage Disposal Services", level: "commodity", parentCode: "7614", description: "Waste disposal" },
      { code: "76141502", name: "Battery Recycling", level: "commodity", parentCode: "7614", description: "Battery disposal" },

      // Travel Services (7811)
      { code: "78111501", name: "Travel Services", level: "commodity", parentCode: "7811", description: "General travel services" },
      { code: "78111502", name: "Travel Agents", level: "commodity", parentCode: "7811", description: "Travel agencies" },
      { code: "78111503", name: "Tour Services", level: "commodity", parentCode: "7811", description: "Tour operators" },
      { code: "78111504", name: "Tourism Guidance Services", level: "commodity", parentCode: "7811", description: "Tour guides" },
      { code: "78111505", name: "Tourism and Recreation Consultants", level: "commodity", parentCode: "7811", description: "Tourism consulting" },
      { code: "78111506", name: "Travel Document Assistance", level: "commodity", parentCode: "7811", description: "Document services" },
      { code: "78111507", name: "Visa Services", level: "commodity", parentCode: "7811", description: "Visa processing" },
      // Transportation (7812)
      { code: "78121501", name: "Car Rental", level: "commodity", parentCode: "7812", description: "Vehicle rental" },
      { code: "78121502", name: "Buses Rental", level: "commodity", parentCode: "7812", description: "Bus rental services" },
      { code: "78121503", name: "Taxi Services", level: "commodity", parentCode: "7812", description: "Taxi services" },

      // Logistics (7813)
      { code: "78131501", name: "Postal and Courier Services", level: "commodity", parentCode: "7813", description: "Courier services" },
      { code: "78131502", name: "Packaging Services", level: "commodity", parentCode: "7813", description: "Packaging services" },

      // Accommodation (7814)
      { code: "78141501", name: "Hotels and Lodging and Meeting Facilities", level: "commodity", parentCode: "7814", description: "Hotel services" },

      // Insurance Services (8411)
      { code: "84111501", name: "Accidents and Liabilities Insurance", level: "commodity", parentCode: "8411", description: "Liability insurance" },
      { code: "84111502", name: "Health Insurance", level: "commodity", parentCode: "8411", description: "Health insurance" },
      { code: "84111503", name: "Insurance Agent", level: "commodity", parentCode: "8411", description: "Insurance agents" },
      { code: "84111504", name: "Insurance Brokers", level: "commodity", parentCode: "8411", description: "Insurance brokers" },
      { code: "84111505", name: "Insurance and Retirement Services", level: "commodity", parentCode: "8411", description: "Retirement planning" },

      // Tax Services (8412)
      { code: "84121501", name: "Income Tax", level: "commodity", parentCode: "8412", description: "Tax services" },
      { code: "84121502", name: "Tax Reclaim Services", level: "commodity", parentCode: "8412", description: "Tax recovery" },

      // Credit Services (8413)
      { code: "84131501", name: "Credit Rating Services", level: "commodity", parentCode: "8413", description: "Credit services" },

      // Electrical Supplies (3911)
      { code: "39111501", name: "Electrical Hardware and Supplies", level: "commodity", parentCode: "3911", description: "Electrical supplies" },
      { code: "39111502", name: "Electrical Wire", level: "commodity", parentCode: "3911", description: "Wiring products" },
      { code: "39111503", name: "Electrical Measuring and Testing Equipment", level: "commodity", parentCode: "3911", description: "Test equipment" },

      // Electrical Services (3912)
      { code: "39121501", name: "Electrical Services", level: "commodity", parentCode: "3912", description: "Electrical work" },

      // Air Conditioning (3913)
      { code: "39131501", name: "Air-Condition Trading", level: "commodity", parentCode: "3913", description: "AC units" },
      { code: "39131502", name: "Air-Conditioning Units Assembling", level: "commodity", parentCode: "3913", description: "AC assembly" },
      { code: "39131503", name: "Air-condition Repairing and Maintenance", level: "commodity", parentCode: "3913", description: "AC repair" },
      { code: "39131504", name: "Aircondition and Refrigeration Spare Parts", level: "commodity", parentCode: "3913", description: "AC parts" },

      // Batteries (3914)
      { code: "39141501", name: "Batteries and Accessories", level: "commodity", parentCode: "3914", description: "Battery products" },
      { code: "39141502", name: "Batteries Distilled Water Manufacturing", level: "commodity", parentCode: "3914", description: "Battery supplies" },

      // Catering Services (5011)
      { code: "50111501", name: "Catering Services", level: "commodity", parentCode: "5011", description: "Catering" },
      { code: "50111502", name: "Cafeteria", level: "commodity", parentCode: "5011", description: "Cafeteria services" },

      // Beverages (5012)
      { code: "50121501", name: "Beverages", level: "commodity", parentCode: "5012", description: "Drinks and beverages" },

      // Bakery Products (5013)
      { code: "50131501", name: "Bread and Bakery Products", level: "commodity", parentCode: "5013", description: "Bakery items" },

      // Vending (5014)
      { code: "50141501", name: "Vending Machines", level: "commodity", parentCode: "5014", description: "Vending services" },

      // Medical Services (8511)
      { code: "85111501", name: "Ambulance Services", level: "commodity", parentCode: "8511", description: "Emergency medical transport" },
      { code: "85111502", name: "Blood Bank Service Center", level: "commodity", parentCode: "8511", description: "Blood bank services" },
      { code: "85111503", name: "Community and Social Services", level: "commodity", parentCode: "8511", description: "Community services" },
      // Fire Safety (8512)
      { code: "85121501", name: "Fire Protection", level: "commodity", parentCode: "8512", description: "Fire safety" },
      { code: "85121502", name: "Fire Extinguishing Materials Trading", level: "commodity", parentCode: "8512", description: "Fire extinguishers" },
      { code: "85121503", name: "Fire Fighting Equipment Installation", level: "commodity", parentCode: "8512", description: "Fire equipment install" },
      { code: "85121504", name: "Fire Fighting and Safety Equipment Trading", level: "commodity", parentCode: "8512", description: "Safety equipment" },
      { code: "85121505", name: "Fire Safety Consultancy", level: "commodity", parentCode: "8512", description: "Fire consulting" },
      { code: "85121506", name: "Fire Safety Training", level: "commodity", parentCode: "8512", description: "Safety training" },
      { code: "85121507", name: "Fire Safety and Protection Engineering", level: "commodity", parentCode: "8512", description: "Fire engineering" },
      { code: "85121508", name: "Fire Fighting Equipment", level: "commodity", parentCode: "8512", description: "Fire equipment" },
      // Film Production (5511)
      { code: "55111501", name: "Film TV and Radio Production Services", level: "commodity", parentCode: "5511", description: "Media production" },
      { code: "55111502", name: "Documentary Filming", level: "commodity", parentCode: "5511", description: "Documentary services" },
      { code: "55111503", name: "Films Translating and Subtitling Services", level: "commodity", parentCode: "5511", description: "Translation services" },
      { code: "55111504", name: "Entertainment Services", level: "commodity", parentCode: "5511", description: "Entertainment" },
      { code: "55111505", name: "Moving Picture Media", level: "commodity", parentCode: "5511", description: "Video media" },
      { code: "55111506", name: "Mass Communication Services", level: "commodity", parentCode: "5511", description: "Mass media" },
      // Photography (5512)
      { code: "55121501", name: "Film Processing Services", level: "commodity", parentCode: "5512", description: "Photo processing" },
      { code: "55121502", name: "Films and Photography Materials Trading", level: "commodity", parentCode: "5512", description: "Photo supplies" },
      { code: "55121503", name: "Photographic and Recording Media", level: "commodity", parentCode: "5512", description: "Recording media" },
      { code: "55121504", name: "Camera Accessories", level: "commodity", parentCode: "5512", description: "Camera supplies" },
      { code: "55121505", name: "Cameras", level: "commodity", parentCode: "5512", description: "Camera equipment" },

      // Publishing (5513)
      { code: "55131501", name: "Books Newspapers and Publications Trading", level: "commodity", parentCode: "5513", description: "Publications" },
      { code: "55131502", name: "Editorial and Support Services", level: "commodity", parentCode: "5513", description: "Editorial services" },

      // News Services (5514)
      { code: "55141501", name: "News and Publicity Services", level: "commodity", parentCode: "5514", description: "News services" },

      // Office Furniture (5611)
      { code: "56111501", name: "Furniture and Furnishings", level: "commodity", parentCode: "5611", description: "General furniture" },

      // Household Items (5612)
      { code: "56121501", name: "Household Items", level: "commodity", parentCode: "5612", description: "Home furnishings" },
      { code: "56121502", name: "Kitchen Items", level: "commodity", parentCode: "5612", description: "Kitchen furnishings" },
      { code: "56121503", name: "TVs", level: "commodity", parentCode: "5612", description: "Television sets" },
      { code: "56121504", name: "Bikes", level: "commodity", parentCode: "5612", description: "Bicycles" },

      // Carpets and Linens (5613)
      { code: "56131501", name: "Carpets Trading", level: "commodity", parentCode: "5613", description: "Carpet products" },
      { code: "56131502", name: "Blankets Towels and Linens Trading", level: "commodity", parentCode: "5613", description: "Linen products" },

      // Training Services (8611)
      { code: "86111501", name: "Education and Training Services", level: "commodity", parentCode: "8611", description: "Training services" },

      // Educational Materials (8612)
      { code: "86121501", name: "Educational and Research Structures", level: "commodity", parentCode: "8612", description: "Educational facilities" },

      // Clothing (4611)
      { code: "46111501", name: "Apparel", level: "commodity", parentCode: "4611", description: "Clothing and apparel" },

      // Real Estate Services (7211)
      { code: "72111501", name: "Real Estate Services", level: "commodity", parentCode: "7211", description: "Property services" },

      // Building Structures (7212)
      { code: "72121501", name: "Educational and Research Structures", level: "commodity", parentCode: "7212", description: "Research buildings" },
    ];

    categoryData.forEach(cat => {
      const id = randomUUID();
      const category: Category = {
        id,
        code: cat.code,
        name: cat.name,
        description: cat.description,
        level: cat.level,
        parentCode: cat.parentCode,
        isActive: true,
        createdAt: now,
      };
      this.categories.set(id, category);
    });

    // Seed items (Item Master)
    const sampleItems: Array<{
      itemCode: string;
      name: string;
      description: string;
      categoryCode: string;
      categoryName: string;
      unitOfMeasure: string;
      standardPrice: number;
      manufacturer?: string;
      manufacturerPartNumber?: string;
      leadTimeDays?: number;
      minOrderQuantity?: number;
    }> = [
      // Computer Equipment
      { itemCode: "IT-LAP-001", name: "Dell Latitude 5540 Laptop", description: "15.6 inch business laptop with Intel Core i7, 16GB RAM, 512GB SSD", categoryCode: "43211503", categoryName: "Notebook Computers", unitOfMeasure: "EA", standardPrice: 89500, manufacturer: "Dell", manufacturerPartNumber: "LAT5540-I7", leadTimeDays: 14, minOrderQuantity: 1 },
      { itemCode: "IT-LAP-002", name: "HP EliteBook 850 G10", description: "15.6 inch enterprise laptop with Intel Core i5, 16GB RAM, 256GB SSD", categoryCode: "43211503", categoryName: "Notebook Computers", unitOfMeasure: "EA", standardPrice: 78000, manufacturer: "HP", manufacturerPartNumber: "EB850G10-I5", leadTimeDays: 10, minOrderQuantity: 1 },
      { itemCode: "IT-LAP-003", name: "Lenovo ThinkPad X1 Carbon", description: "14 inch ultrabook with Intel Core i7, 32GB RAM, 1TB SSD", categoryCode: "43211503", categoryName: "Notebook Computers", unitOfMeasure: "EA", standardPrice: 145000, manufacturer: "Lenovo", manufacturerPartNumber: "X1C-GEN11", leadTimeDays: 21, minOrderQuantity: 1 },
      { itemCode: "IT-DT-001", name: "Dell OptiPlex 7010 Desktop", description: "Small form factor desktop with Intel Core i5, 8GB RAM, 256GB SSD", categoryCode: "43211501", categoryName: "Desktop Computers", unitOfMeasure: "EA", standardPrice: 52000, manufacturer: "Dell", manufacturerPartNumber: "OPT7010-I5", leadTimeDays: 7, minOrderQuantity: 1 },
      { itemCode: "IT-DT-002", name: "HP ProDesk 400 G9", description: "Micro tower desktop with Intel Core i3, 8GB RAM, 256GB SSD", categoryCode: "43211501", categoryName: "Desktop Computers", unitOfMeasure: "EA", standardPrice: 38500, manufacturer: "HP", manufacturerPartNumber: "PD400G9-I3", leadTimeDays: 7, minOrderQuantity: 1 },
      { itemCode: "IT-MON-001", name: "Dell UltraSharp U2422H Monitor", description: "24 inch FHD IPS USB-C monitor", categoryCode: "43211509", categoryName: "Computer Monitors", unitOfMeasure: "EA", standardPrice: 28500, manufacturer: "Dell", manufacturerPartNumber: "U2422H", leadTimeDays: 5, minOrderQuantity: 1 },
      { itemCode: "IT-MON-002", name: "LG 27UK850-W 4K Monitor", description: "27 inch 4K UHD IPS monitor with USB-C", categoryCode: "43211509", categoryName: "Computer Monitors", unitOfMeasure: "EA", standardPrice: 42000, manufacturer: "LG", manufacturerPartNumber: "27UK850-W", leadTimeDays: 7, minOrderQuantity: 1 },
      { itemCode: "IT-TAB-001", name: "Apple iPad Pro 12.9 inch", description: "M2 chip, 256GB WiFi tablet", categoryCode: "43211507", categoryName: "Tablet Computers", unitOfMeasure: "EA", standardPrice: 112900, manufacturer: "Apple", manufacturerPartNumber: "IPADPRO12-M2", leadTimeDays: 3, minOrderQuantity: 1 },
      { itemCode: "IT-PROJ-001", name: "Epson EB-X51 Projector", description: "XGA 3LCD projector 3800 lumens", categoryCode: "43211903", categoryName: "Projectors", unitOfMeasure: "EA", standardPrice: 48000, manufacturer: "Epson", manufacturerPartNumber: "EB-X51", leadTimeDays: 7, minOrderQuantity: 1 },
      
      // Software
      { itemCode: "SW-OFF-001", name: "Microsoft 365 Business Premium License", description: "Annual subscription per user", categoryCode: "43233004", categoryName: "Office Suite Software", unitOfMeasure: "EA", standardPrice: 15500, manufacturer: "Microsoft", manufacturerPartNumber: "M365-BP-1Y", leadTimeDays: 1, minOrderQuantity: 5 },
      { itemCode: "SW-OFF-002", name: "Adobe Creative Cloud License", description: "All Apps annual subscription per user", categoryCode: "43232302", categoryName: "Graphics Software", unitOfMeasure: "EA", standardPrice: 28000, manufacturer: "Adobe", manufacturerPartNumber: "ACC-ALL-1Y", leadTimeDays: 1, minOrderQuantity: 1 },
      { itemCode: "SW-PM-001", name: "Jira Software Cloud Premium", description: "Per user per month license", categoryCode: "43232101", categoryName: "Project Management Software", unitOfMeasure: "EA", standardPrice: 1200, manufacturer: "Atlassian", manufacturerPartNumber: "JIRA-CLOUD-P", leadTimeDays: 1, minOrderQuantity: 10 },
      
      // Office Equipment
      { itemCode: "OF-PRT-001", name: "HP LaserJet Pro MFP M428fdw", description: "Multifunction laser printer with duplex", categoryCode: "44111905", categoryName: "Laser Printers", unitOfMeasure: "EA", standardPrice: 38500, manufacturer: "HP", manufacturerPartNumber: "M428FDW", leadTimeDays: 5, minOrderQuantity: 1 },
      { itemCode: "OF-PRT-002", name: "Epson EcoTank L3250", description: "All-in-one inkjet printer with tank system", categoryCode: "44111906", categoryName: "Inkjet Printers", unitOfMeasure: "EA", standardPrice: 12500, manufacturer: "Epson", manufacturerPartNumber: "L3250", leadTimeDays: 3, minOrderQuantity: 1 },
      { itemCode: "OF-CHR-001", name: "Herman Miller Aeron Chair", description: "Ergonomic office chair, Size B", categoryCode: "44121600", categoryName: "Office Chairs", unitOfMeasure: "EA", standardPrice: 125000, manufacturer: "Herman Miller", manufacturerPartNumber: "AERON-B", leadTimeDays: 30, minOrderQuantity: 1 },
      { itemCode: "OF-CHR-002", name: "Steelcase Leap V2 Chair", description: "High-back ergonomic task chair", categoryCode: "44121600", categoryName: "Office Chairs", unitOfMeasure: "EA", standardPrice: 85000, manufacturer: "Steelcase", manufacturerPartNumber: "LEAP-V2", leadTimeDays: 21, minOrderQuantity: 1 },
      { itemCode: "OF-DSK-001", name: "Standing Desk 150x75cm", description: "Electric height adjustable desk", categoryCode: "44121700", categoryName: "Office Desks", unitOfMeasure: "EA", standardPrice: 28500, manufacturer: "Featherlite", manufacturerPartNumber: "SD-150-E", leadTimeDays: 14, minOrderQuantity: 1 },
      
      // Safety Equipment
      { itemCode: "SF-GLV-001", name: "Industrial Safety Gloves (Box of 50)", description: "Heavy duty nitrile coated work gloves", categoryCode: "46181504", categoryName: "Safety Gloves", unitOfMeasure: "BOX", standardPrice: 2500, manufacturer: "3M", manufacturerPartNumber: "CG-500", leadTimeDays: 3, minOrderQuantity: 5 },
      { itemCode: "SF-FE-001", name: "ABC Fire Extinguisher 5kg", description: "Dry chemical powder fire extinguisher", categoryCode: "46191601", categoryName: "Fire Extinguishers", unitOfMeasure: "EA", standardPrice: 3200, manufacturer: "Cease Fire", manufacturerPartNumber: "ABC-5KG", leadTimeDays: 5, minOrderQuantity: 2 },
      
      // Cleaning Supplies
      { itemCode: "CL-FLR-001", name: "Industrial Floor Cleaner 20L", description: "Heavy duty floor cleaning solution", categoryCode: "47131803", categoryName: "Floor Cleaners", unitOfMeasure: "EA", standardPrice: 1800, manufacturer: "Diversey", manufacturerPartNumber: "FC-20L", leadTimeDays: 3, minOrderQuantity: 5 },
      
      // Training Materials
      { itemCode: "TR-MAT-001", name: "Training Manual Printing Service", description: "100 copies per lot, spiral bound", categoryCode: "55101509", categoryName: "Training Materials", unitOfMeasure: "LOT", standardPrice: 8500, manufacturer: "Internal", manufacturerPartNumber: "TM-100", leadTimeDays: 7, minOrderQuantity: 1 },
      
      // Network Equipment (for PR line items)
      { itemCode: "NW-SW-001", name: "Cisco 48-Port Network Switch", description: "Catalyst 2960-X 48-port Gigabit Ethernet switch", categoryCode: "43222612", categoryName: "Network Switches", unitOfMeasure: "EA", standardPrice: 125000, manufacturer: "Cisco", manufacturerPartNumber: "WS-C2960X-48", leadTimeDays: 14, minOrderQuantity: 1 },
      { itemCode: "NW-SW-002", name: "HP Aruba 24-Port Switch", description: "Aruba 2530 24-port PoE+ switch", categoryCode: "43222612", categoryName: "Network Switches", unitOfMeasure: "EA", standardPrice: 85000, manufacturer: "HP Aruba", manufacturerPartNumber: "JL356A", leadTimeDays: 10, minOrderQuantity: 1 },
      { itemCode: "NW-RAM-001", name: "Server DDR4 RAM 64GB", description: "ECC Registered DDR4-3200 RDIMM", categoryCode: "43201807", categoryName: "Random Access Memory", unitOfMeasure: "EA", standardPrice: 28000, manufacturer: "Samsung", manufacturerPartNumber: "M393A8G40AB2", leadTimeDays: 7, minOrderQuantity: 1 },
      { itemCode: "NW-CAB-001", name: "Cat6A Ethernet Cable 100m", description: "Cat6A UTP cable, 100 meter box", categoryCode: "26121636", categoryName: "Ethernet Cables", unitOfMeasure: "BOX", standardPrice: 3500, manufacturer: "Belkin", manufacturerPartNumber: "A7L704-100", leadTimeDays: 5, minOrderQuantity: 1 },
      
      // Furniture - Additional (for PR line items using 56xxx codes)
      { itemCode: "FN-CHR-001", name: "Ergonomic Office Chair with Lumbar Support", description: "High-back mesh chair with adjustable lumbar", categoryCode: "56101504", categoryName: "Office Chairs", unitOfMeasure: "EA", standardPrice: 12500, manufacturer: "Godrej", manufacturerPartNumber: "MOTION-HB", leadTimeDays: 14, minOrderQuantity: 1 },
      { itemCode: "FN-DSK-001", name: "Height Adjustable Standing Desk", description: "Electric sit-stand desk 160x80cm", categoryCode: "56101503", categoryName: "Office Desks", unitOfMeasure: "EA", standardPrice: 35000, manufacturer: "Featherlite", manufacturerPartNumber: "OPTIMA-SS", leadTimeDays: 21, minOrderQuantity: 1 },
      { itemCode: "FN-MON-001", name: "Monitor Arm Dual Mount", description: "Dual monitor arm with gas spring", categoryCode: "43211706", categoryName: "Monitor Stands", unitOfMeasure: "EA", standardPrice: 4500, manufacturer: "AmazonBasics", manufacturerPartNumber: "B07XKFX3B2", leadTimeDays: 5, minOrderQuantity: 1 },
      { itemCode: "FN-ORG-001", name: "Desk Organizer Set", description: "5-piece desktop organization set", categoryCode: "44121701", categoryName: "Desk Organizers", unitOfMeasure: "SET", standardPrice: 850, manufacturer: "Cello", manufacturerPartNumber: "DORG-5PC", leadTimeDays: 3, minOrderQuantity: 5 },
      { itemCode: "FN-SHV-001", name: "Heavy Duty Shelving Unit", description: "5-tier industrial steel shelving 180x90x45cm", categoryCode: "56101702", categoryName: "Industrial Shelving", unitOfMeasure: "EA", standardPrice: 12500, manufacturer: "Nilkamal", manufacturerPartNumber: "IND-SHV-5T", leadTimeDays: 10, minOrderQuantity: 1 },
      
      // Manufacturing Raw Materials (for PR line items)
      { itemCode: "MF-STL-001", name: "Stainless Steel Sheet 304 (4x8ft, 2mm)", description: "SS304 grade sheet metal 2mm thick", categoryCode: "30102209", categoryName: "Stainless Steel Sheets", unitOfMeasure: "PC", standardPrice: 8500, manufacturer: "Jindal Steel", manufacturerPartNumber: "SS304-2MM", leadTimeDays: 7, minOrderQuantity: 10 },
      { itemCode: "MF-ALU-001", name: "Aluminum Sheet 6061-T6 (4x8ft, 3mm)", description: "6061-T6 alloy aluminum sheet 3mm", categoryCode: "30102207", categoryName: "Aluminum Sheets", unitOfMeasure: "PC", standardPrice: 6200, manufacturer: "Hindalco", manufacturerPartNumber: "AL6061-3MM", leadTimeDays: 7, minOrderQuantity: 10 },
      { itemCode: "MF-BLD-001", name: "Industrial Cutting Blades", description: "High-speed steel cutting blades for sheet metal", categoryCode: "27111701", categoryName: "Cutting Blades", unitOfMeasure: "PC", standardPrice: 2800, manufacturer: "Makita", manufacturerPartNumber: "HSS-CB-12", leadTimeDays: 5, minOrderQuantity: 5 },
      
      // Medical Supplies (for PR line items)
      { itemCode: "MD-FAK-001", name: "First Aid Kit Industrial Grade", description: "Complete first aid kit for 50 persons", categoryCode: "42172001", categoryName: "First Aid Kits", unitOfMeasure: "EA", standardPrice: 3500, manufacturer: "St John Ambulance", manufacturerPartNumber: "FAK-IND-50", leadTimeDays: 5, minOrderQuantity: 1 },
      { itemCode: "MD-MSK-001", name: "Disposable Face Masks (Box of 100)", description: "3-ply surgical disposable masks", categoryCode: "42131713", categoryName: "Medical Masks", unitOfMeasure: "BOX", standardPrice: 450, manufacturer: "Venus", manufacturerPartNumber: "V-4420", leadTimeDays: 3, minOrderQuantity: 10 },
      { itemCode: "MD-SAN-001", name: "Hand Sanitizer 500ml", description: "70% alcohol-based hand sanitizer", categoryCode: "53131624", categoryName: "Hand Sanitizers", unitOfMeasure: "EA", standardPrice: 180, manufacturer: "Dettol", manufacturerPartNumber: "HS-500ML", leadTimeDays: 3, minOrderQuantity: 20 },
      { itemCode: "MD-THM-001", name: "Digital Thermometer", description: "Infrared non-contact digital thermometer", categoryCode: "42182401", categoryName: "Thermometers", unitOfMeasure: "EA", standardPrice: 1200, manufacturer: "Omron", manufacturerPartNumber: "MC-720", leadTimeDays: 3, minOrderQuantity: 5 },
      
      // Lab Equipment (for PR line items)
      { itemCode: "LB-OSC-001", name: "Digital Oscilloscope 200MHz", description: "4-channel 200MHz digital oscilloscope", categoryCode: "41113621", categoryName: "Oscilloscopes", unitOfMeasure: "EA", standardPrice: 185000, manufacturer: "Tektronix", manufacturerPartNumber: "TBS2204B", leadTimeDays: 21, minOrderQuantity: 1 },
      { itemCode: "LB-MTR-001", name: "Precision Digital Multimeter", description: "6.5 digit precision DMM with data logging", categoryCode: "41113634", categoryName: "Multimeters", unitOfMeasure: "EA", standardPrice: 25000, manufacturer: "Fluke", manufacturerPartNumber: "FLUKE-87V", leadTimeDays: 10, minOrderQuantity: 1 },
      { itemCode: "LB-SOL-001", name: "Soldering Station Professional", description: "Temperature controlled soldering station 60W", categoryCode: "23271511", categoryName: "Soldering Equipment", unitOfMeasure: "EA", standardPrice: 18000, manufacturer: "Weller", manufacturerPartNumber: "WE1010", leadTimeDays: 7, minOrderQuantity: 1 },
      
      // Marketing Print Materials (for PR line items)
      { itemCode: "MK-BRO-001", name: "Product Brochures A4 Glossy (500 pcs)", description: "Full color A4 glossy brochures", categoryCode: "55101504", categoryName: "Printed Brochures", unitOfMeasure: "LOT", standardPrice: 15000, manufacturer: "Print House", manufacturerPartNumber: "BRO-A4-500", leadTimeDays: 7, minOrderQuantity: 1 },
      { itemCode: "MK-BAN-001", name: "Roll-up Banner Stand 85x200cm", description: "Retractable roll-up banner with aluminum stand", categoryCode: "55121608", categoryName: "Banner Stands", unitOfMeasure: "EA", standardPrice: 4500, manufacturer: "Display Pro", manufacturerPartNumber: "RUB-85X200", leadTimeDays: 5, minOrderQuantity: 1 },
      { itemCode: "MK-BCD-001", name: "Business Cards Premium (Box of 500)", description: "350gsm matte laminated business cards", categoryCode: "55101507", categoryName: "Business Cards", unitOfMeasure: "BOX", standardPrice: 2500, manufacturer: "Print House", manufacturerPartNumber: "BC-PREM-500", leadTimeDays: 5, minOrderQuantity: 1 },
      
      // Logistics Equipment (for PR line items)
      { itemCode: "LG-PLT-001", name: "Electric Pallet Jack 2000kg", description: "Electric pallet truck 2000kg capacity", categoryCode: "24101507", categoryName: "Pallet Trucks", unitOfMeasure: "EA", standardPrice: 285000, manufacturer: "Toyota", manufacturerPartNumber: "8HBW23", leadTimeDays: 30, minOrderQuantity: 1 },
      { itemCode: "LG-TPD-001", name: "Packing Tape Dispenser Industrial", description: "Heavy duty industrial tape gun", categoryCode: "24112404", categoryName: "Tape Dispensers", unitOfMeasure: "EA", standardPrice: 850, manufacturer: "3M", manufacturerPartNumber: "H180", leadTimeDays: 3, minOrderQuantity: 5 },
      { itemCode: "LG-STR-001", name: "Stretch Wrap Film 500mm (6 rolls)", description: "Clear stretch wrap film 500mm x 300m", categoryCode: "24112403", categoryName: "Stretch Film", unitOfMeasure: "SET", standardPrice: 2200, manufacturer: "Presto", manufacturerPartNumber: "SW-500-6", leadTimeDays: 3, minOrderQuantity: 5 },
      
      // Facility Supplies (for PR line items)
      { itemCode: "FC-LED-001", name: "LED Tube Light T8 4ft", description: "18W LED tube light 4 feet daylight", categoryCode: "39111610", categoryName: "LED Lights", unitOfMeasure: "EA", standardPrice: 450, manufacturer: "Philips", manufacturerPartNumber: "T8-LED-18W", leadTimeDays: 3, minOrderQuantity: 20 },
      { itemCode: "FC-PRS-001", name: "Wireless Presenter Remote", description: "Laser pointer with presentation controls", categoryCode: "43211510", categoryName: "Presentation Remotes", unitOfMeasure: "EA", standardPrice: 2500, manufacturer: "Logitech", manufacturerPartNumber: "R500", leadTimeDays: 3, minOrderQuantity: 1 },
    ];

    sampleItems.forEach((itemData, index) => {
      const id = randomUUID();
      const item: Item = {
        id,
        itemCode: itemData.itemCode,
        name: itemData.name,
        description: itemData.description,
        categoryCode: itemData.categoryCode,
        categoryName: itemData.categoryName,
        unitOfMeasure: itemData.unitOfMeasure,
        standardPrice: itemData.standardPrice,
        currency: "INR",
        manufacturer: itemData.manufacturer || null,
        manufacturerPartNumber: itemData.manufacturerPartNumber || null,
        leadTimeDays: itemData.leadTimeDays || null,
        minOrderQuantity: itemData.minOrderQuantity || 1,
        status: "active",
        isActive: true,
        createdAt: now,
        updatedAt: null,
      };
      this.items.set(id, item);
    });
    this.itemCounter = 10000 + sampleItems.length;
  }

  // Users
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = {
      id,
      username: insertUser.username,
      password: insertUser.password,
      role: insertUser.role || 'user',
      vendorId: insertUser.vendorId ?? null,
      displayName: insertUser.displayName ?? null,
      email: insertUser.email ?? null,
    };
    this.users.set(id, user);
    return user;
  }

  // DBO Suppliers (Production Vendor Data)
  async getDboSuppliers(): Promise<DboSupplier[]> {
    const result = await getDb().select().from(dboSuppliers).orderBy(asc(dboSuppliers.companyName));
    return result;
  }

  async getDboSuppliersPaginated(params: { page: number; limit: number; status?: string; search?: string; sortBy?: string; metrics?: string }): Promise<{ data: DboSupplier[]; pagination: { page: number; limit: number; total: number; totalPages: number }; statusCounts: Record<string, number> }> {
    const { page, limit, status, search, sortBy, metrics } = params;
    const offset = (page - 1) * limit;

    // Get all suppliers for counting
    const allSuppliers = await getDb().select().from(dboSuppliers);

    // Calculate status counts
    const statusCounts: Record<string, number> = {};
    allSuppliers.forEach(s => {
      const st = s.status || "Unknown";
      statusCounts[st] = (statusCounts[st] || 0) + 1;
    });

    // Build conditions (comma-separated statuses match dashboard links, same idea as invoice list)
    const conditions: any[] = [];
    if (status && status !== "all") {
      const parts = status.split(",").map((s) => s.trim()).filter(Boolean);
      if (parts.length > 1) {
        const conditionsToOr = [inArray(dboSuppliers.status, parts)];

        if (parts.includes("Active")) {
          conditionsToOr.push(eq(dboSuppliers.attribute4, "Active"));
        }

        conditions.push(or(...conditionsToOr));
      } else {
        conditions.push(or(eq(dboSuppliers.status, parts[0]), eq(dboSuppliers.attribute4, parts[0])));
      }
    }
    if (search) {
      const searchLower = `%${search.toLowerCase()}%`;
      conditions.push(
        or(
          ilike(dboSuppliers.companyName, searchLower),
          ilike(dboSuppliers.emailId, searchLower),
          ilike(dboSuppliers.legalEntityType, searchLower),
          ilike(dboSuppliers.country, searchLower),
          ilike(dboSuppliers.status, searchLower),
          ilike(dboSuppliers.supplierId, searchLower),
          ilike(dboSuppliers.taxRegNo, searchLower),
          ilike(dboSuppliers.panNo, searchLower),
          ilike(dboSuppliers.licenseNo, searchLower),
          ilike(dboSuppliers.taxPayerId, searchLower),
          sql`CAST(${dboSuppliers.id} AS TEXT) LIKE ${searchLower}`
        )
      );
    }

    // Get filtered count
    let filteredCountQuery = getDb().select({ count: sql<number>`count(*)` }).from(dboSuppliers);
    if (conditions.length > 0) {
      filteredCountQuery = filteredCountQuery.where(and(...conditions)) as any;
    }
    const countResult = await filteredCountQuery;
    const total = Number(countResult[0]?.count || 0);

    const shouldRankSort = sortBy === "rank_asc" || sortBy === "rank_desc";

    // Get paginated data
    let dataQuery = getDb().select().from(dboSuppliers).orderBy(desc(dboSuppliers.id));
    if (conditions.length > 0) {
      dataQuery = dataQuery.where(and(...conditions)) as any;
    }

    let data: any = dataQuery;
    if(limit !== 0 && !shouldRankSort) { // if limit is 0, we want to return all results without pagination (used for export), and if sorting by rank, we need to fetch all data first to sort in memory
      data = data.limit(limit).offset(offset);
    }

    const dataResult = await data;


    // Add rankings if enabled
    let suppliersWithRank = dataResult.map((s: any) => ({ ...s, rank: null as number | null }));
    try {
      const activePool = getPool();
      const settingsRes = await activePool.query(`SELECT is_enabled FROM dbo.am_ai_service_settings WHERE feature_key = 'AI_SUPPLIER_RANK'`);
      const isRankEnabled = settingsRes.rows[0]?.is_enabled ?? false;

      if (isRankEnabled) {
        const engine = new SupplierRankEngine(activePool);
        const metricList = metrics ? metrics.split(",") : undefined;
        const allRanks = await engine.run({ withAI: false, metrics: metricList });
        const rankBySupplierId = new Map(allRanks.map(r => [String(r.supplier_id), r.rank]));
        suppliersWithRank = dataResult.map((s: any) => {
          const rank = rankBySupplierId.get(String(s.id));
          return { ...s, rank: rank || null };
        });

        // Handle Sorting
        if (sortBy === "rank_asc") {
          suppliersWithRank.sort((a: any, b: any) => {
            const rA = a.rank || 999999;
            const rB = b.rank || 999999;
            return rA - rB;
          });
        } else if (sortBy === "rank_desc") {
          suppliersWithRank.sort((a: any, b: any) => {
            const rA = a.rank || 0;
            const rB = b.rank || 0;
            return rB - rA;
          });
        } else if (sortBy === "companyName") {
          suppliersWithRank.sort((a: any, b: any) => (a.companyName || "").localeCompare(b.companyName || ""));
        } else if (sortBy === "status") {
          suppliersWithRank.sort((a: any, b: any) => (a.status || "").localeCompare(b.status || ""));
        }
      }
    } catch (err) {
      console.error("[Storage] Failed to fetch supplier ranks:", err);
    }

    const paginatedSuppliers = shouldRankSort
      ? suppliersWithRank.slice(offset, offset + limit)
      : suppliersWithRank;

    return {
      data: paginatedSuppliers as any,
      pagination: {
        page,
        limit,
        total,
        totalPages: limit === 0 ? 1 : Math.max(1, Math.ceil(total / limit)),
      },
      statusCounts
    };
  }

  async searchDboSuppliersForAgent(params: { query: string; limit?: number; scopeOfSupplyOnly?: boolean }): Promise<Array<{ id: number; companyName: string | null; emailId: string | null; supplierId: string | null }>> {
    const query = String(params.query || "").trim();
    if (!query) return [];

    const limit = Math.min(Math.max(params.limit ?? 8, 1), 25);
    const likeQuery = `%${query}%`;
    const prefixLikeQuery = `${query}%`;
    const wordStartLikeQuery = `% ${query}%`;
    const normalizedQuery = query.toLowerCase();

    const conditions = [
      sql`(${dboSuppliers.companyName} ILIKE ${likeQuery} OR ${dboSuppliers.emailId} ILIKE ${likeQuery} OR ${dboSuppliers.supplierId} ILIKE ${likeQuery} OR CAST(${dboSuppliers.id} AS TEXT) ILIKE ${likeQuery})`,
      inArray(dboSuppliers.status, ["Active", "Approved"]),
    ];

    if (params.scopeOfSupplyOnly) {
      conditions.push(
        sql`EXISTS (SELECT 1 FROM dbo.supp_scope_of_supply_service s WHERE s.supplier_id = ${dboSuppliers.id})`
      );
    }

    const rows = await getDb()
      .select({
        id: dboSuppliers.id,
        companyName: dboSuppliers.companyName,
        emailId: dboSuppliers.emailId,
        supplierId: dboSuppliers.supplierId,
      })
      .from(dboSuppliers)
      .where(
        and(
          ...conditions,
          sql`(
            ${dboSuppliers.companyName} ILIKE ${likeQuery}
            OR ${dboSuppliers.emailId} ILIKE ${likeQuery}
            OR ${dboSuppliers.supplierId} ILIKE ${likeQuery}
            OR CAST(${dboSuppliers.id} AS TEXT) ILIKE ${likeQuery}
            OR ${dboSuppliers.taxRegNo} ILIKE ${likeQuery}
            OR ${dboSuppliers.panNo} ILIKE ${likeQuery}
            OR ${dboSuppliers.licenseNo} ILIKE ${likeQuery}
            OR ${dboSuppliers.taxPayerId} ILIKE ${likeQuery}
          )`,
          inArray(dboSuppliers.status, ["Active", "Approved"])
        )
      )
      .orderBy(
        sql`CASE
          WHEN lower(trim(coalesce(${dboSuppliers.taxRegNo}, ''))) = ${normalizedQuery} THEN 0
          WHEN lower(trim(coalesce(${dboSuppliers.panNo}, ''))) = ${normalizedQuery} THEN 0
          WHEN lower(trim(coalesce(${dboSuppliers.licenseNo}, ''))) = ${normalizedQuery} THEN 0
          WHEN lower(trim(coalesce(${dboSuppliers.taxPayerId}, ''))) = ${normalizedQuery} THEN 0
          WHEN lower(coalesce(${dboSuppliers.emailId}, '')) = ${normalizedQuery} THEN 1
          WHEN coalesce(${dboSuppliers.emailId}, '') ILIKE ${prefixLikeQuery} THEN 2
          WHEN coalesce(${dboSuppliers.supplierId}, '') ILIKE ${prefixLikeQuery} THEN 3
          WHEN CAST(${dboSuppliers.id} AS TEXT) ILIKE ${prefixLikeQuery} THEN 4
          WHEN coalesce(${dboSuppliers.companyName}, '') ILIKE ${prefixLikeQuery} THEN 5
          WHEN coalesce(${dboSuppliers.companyName}, '') ILIKE ${wordStartLikeQuery} THEN 6
          ELSE 7
        END`,
        asc(dboSuppliers.companyName),
        asc(dboSuppliers.id),
      )
      .limit(limit);

    return rows.map((row) => ({
      id: row.id,
      companyName: row.companyName ?? null,
      emailId: row.emailId ?? null,
      supplierId: row.supplierId ?? null,
    }));
  }

  async listDboSuppliersForAgentBrowse(params: { offset: number; limit: number; scopeOfSupplyOnly?: boolean }): Promise<{
    vendors: Array<{ id: number; companyName: string | null; emailId: string | null; supplierId: string | null }>;
    hasMore: boolean;
  }> {
    const offset = Math.max(0, params.offset || 0);
    const cap = Math.min(Math.max(params.limit ?? 50, 1), 100);
    const fetchLimit = cap + 1;

    const conditions = [
      inArray(dboSuppliers.status, ["Active", "Approved"])
    ];

    if (params.scopeOfSupplyOnly) {
      conditions.push(
        sql`EXISTS (SELECT 1 FROM dbo.supp_scope_of_supply_service s WHERE s.supplier_id = ${dboSuppliers.id})`
      );
    }

    const rows = await getDb()
      .select({
        id: dboSuppliers.id,
        companyName: dboSuppliers.companyName,
        emailId: dboSuppliers.emailId,
        supplierId: dboSuppliers.supplierId,
      })
      .from(dboSuppliers)
      .where(and(...conditions))
      .orderBy(asc(dboSuppliers.companyName), asc(dboSuppliers.id))
      .offset(offset)
      .limit(fetchLimit);

    const hasMore = rows.length > cap;
    const slice = hasMore ? rows.slice(0, cap) : rows;
    return {
      vendors: slice.map((row) => ({
        id: row.id,
        companyName: row.companyName ?? null,
        emailId: row.emailId ?? null,
        supplierId: row.supplierId ?? null,
      })),
      hasMore,
    };
  }

  async getDboSupplier(id: number | string): Promise<DboSupplier | undefined> {
    const parsedId = typeof id === "number" ? id : parseInt(id, 10);
    if (!isNaN(parsedId) && String(parsedId) === String(id)) {
      const result = await getDb()
        .select()
        .from(dboSuppliers)
        .where(
          or(
            eq(dboSuppliers.id, parsedId),
            eq(dboSuppliers.supplierId, String(id))
          )
        );
      return result[0];
    } else {
      const result = await getDb()
        .select()
        .from(dboSuppliers)
        .where(eq(dboSuppliers.supplierId, String(id)));
      return result[0];
    }
  }

  async findDboSupplierByTaxIdentifier(identifier: string): Promise<DboSupplier | undefined> {
    const normalized = String(identifier || "").trim().toLowerCase();
    if (!normalized) return undefined;

    const result = await getDb()
      .select()
      .from(dboSuppliers)
      .where(
        or(
          sql`lower(trim(coalesce(${dboSuppliers.taxRegNo}, ''))) = ${normalized}`,
          sql`lower(trim(coalesce(${dboSuppliers.panNo}, ''))) = ${normalized}`,
          sql`lower(trim(coalesce(${dboSuppliers.licenseNo}, ''))) = ${normalized}`,
          sql`lower(trim(coalesce(${dboSuppliers.taxPayerId}, ''))) = ${normalized}`,
        )
      )
      .limit(1);
    return result[0];
  }

  async getDboSupplierContacts(supplierId: number): Promise<DboSupplierContact[]> {
    const result = await getDb().select().from(dboSupplierContacts).where(eq(dboSupplierContacts.supplierId, supplierId));
    return result;
  }

  async getDboSupplierBanks(supplierId: number): Promise<DboSupplierBank[]> {
    const result = await getDb().select().from(dboSupplierBanks).where(eq(dboSupplierBanks.supplierId, supplierId));
    return result;
  }

  async getDboSupplierDocuments(supplierId: number): Promise<DboSupplierDocument[]> {
    const result = await getDb().select().from(dboSupplierDocuments).where(eq(dboSupplierDocuments.supplierId, supplierId));
    return result;
  }

  async getDboSupplierServices(supplierId: number): Promise<DboSupplierService[]> {
    const result = await getDb().select().from(dboSupplierServices).where(eq(dboSupplierServices.supplierId, supplierId));
    return result;
  }

  async getDboSupplierRefCompanies(supplierId: number): Promise<DboSupplierRefCompany[]> {
    const result = await getDb().select().from(dboSupplierRefCompanies).where(eq(dboSupplierRefCompanies.supplierId, supplierId));
    return result;
  }

  async getDboSupplierApprovalHistory(supplierId: number): Promise<DboSupplierApprovalHistory[]> {
    const result = await getDb()
      .select()
      .from(dboSupplierApprovalHistory)
      .where(eq(dboSupplierApprovalHistory.supplierId, supplierId))
      .orderBy(asc(dboSupplierApprovalHistory.creationDate));
    return result;
  }

  async updateDboSupplierStatus(id: number, status: string): Promise<DboSupplier | undefined> {
    // Map status codes to display values
    const statusMap: Record<string, string> = {
      "approved": "Active",
      "rejected": "Rejected",
      "more_info_requested": "More Info Requested",
      "pending": "Pending Approval",
      "under_review": "Under Review",
    };
    const dbStatus = statusMap[status] || status;

    const result = await getDb()
      .update(dboSuppliers)
      .set({ status: dbStatus })
      .where(eq(dboSuppliers.id, id))
      .returning();
    return result[0];
  }

  // Categories - Using dbo.pm_cat_categories from PostgreSQL database
  async getCategories(): Promise<Category[]> {
    const result = await getDb().select().from(dboPmCatCategories).orderBy(asc(dboPmCatCategories.code));
    return result.map(r => ({
      ...r,
      createdAt: r.createdAt?.toISOString() || new Date().toISOString(),
    })) as Category[];
  }

  async getCategoriesByLevel(level: string): Promise<Category[]> {
    const result = await getDb().select().from(dboPmCatCategories)
      .where(eq(dboPmCatCategories.level, level))
      .orderBy(asc(dboPmCatCategories.code));
    return result.map(r => ({
      ...r,
      createdAt: r.createdAt?.toISOString() || new Date().toISOString(),
    })) as Category[];
  }

  async getCategoriesByParent(parentCode: string): Promise<Category[]> {
    const result = await getDb().select().from(dboPmCatCategories)
      .where(eq(dboPmCatCategories.parentCode, parentCode))
      .orderBy(asc(dboPmCatCategories.code));
    return result.map(r => ({
      ...r,
      createdAt: r.createdAt?.toISOString() || new Date().toISOString(),
    })) as Category[];
  }

  async getCategory(id: string): Promise<Category | undefined> {
    const result = await getDb().select().from(dboPmCatCategories).where(eq(dboPmCatCategories.id, id));
    if (!result[0]) return undefined;
    return {
      ...result[0],
      createdAt: result[0].createdAt?.toISOString() || new Date().toISOString(),
    } as Category;
  }

  async getCategoryByCode(code: string): Promise<Category | undefined> {
    const result = await getDb().select().from(dboPmCatCategories).where(eq(dboPmCatCategories.code, code));
    if (!result[0]) return undefined;
    return {
      ...result[0],
      createdAt: result[0].createdAt?.toISOString() || new Date().toISOString(),
    } as Category;
  }

  async searchCategories(query: string): Promise<Category[]> {
    const searchPattern = `%${query}%`;
    const result = await getDb().select().from(dboPmCatCategories)
      .where(
        or(
          ilike(dboPmCatCategories.code, searchPattern),
          ilike(dboPmCatCategories.name, searchPattern),
          ilike(dboPmCatCategories.description, searchPattern)
        )
      )
      .orderBy(asc(dboPmCatCategories.code));
    return result.map(r => ({
      ...r,
      createdAt: r.createdAt?.toISOString() || new Date().toISOString(),
    })) as Category[];
  }

  async createCategory(insertCat: InsertCategory): Promise<Category> {
    const id = randomUUID();
    const categoryData = {
      id,
      code: insertCat.code,
      name: insertCat.name,
      description: insertCat.description || null,
      level: insertCat.level || 'commodity',
      parentCode: insertCat.parentCode || null,
      isActive: insertCat.isActive ?? true,
      createdAt: new Date(),
    };
    const result = await getDb().insert(dboPmCatCategories).values(categoryData).returning();
    return {
      ...result[0],
      createdAt: result[0].createdAt?.toISOString() || new Date().toISOString(),
    } as Category;
  }

  async updateCategory(id: string, updates: Partial<Category>): Promise<Category | undefined> {
    // Filter out createdAt from updates (immutable field)
    const { createdAt, ...updateData } = updates;
    const result = await getDb().update(dboPmCatCategories)
      .set(updateData)
      .where(eq(dboPmCatCategories.id, id))
      .returning();
    if (!result[0]) return undefined;
    return {
      ...result[0],
      createdAt: result[0].createdAt?.toISOString() || new Date().toISOString(),
    } as Category;
  }

  async deleteCategory(id: string): Promise<boolean> {
    const result = await getDb().delete(dboPmCatCategories).where(eq(dboPmCatCategories.id, id)).returning();
    return result.length > 0;
  }

  /** Columns required for item list/detail — avoids selecting schema fields missing in some DBs (e.g. tax_code_id). */
  private readonly itemProductColumns = {
    id: dboProductMaster.id,
    skuNo: dboProductMaster.skuNo,
    productName: dboProductMaster.productName,
    productShortDesc: dboProductMaster.productShortDesc,
    productLongDesc: dboProductMaster.productLongDesc,
    productSpecification: dboProductMaster.productSpecification,
    productCategory: dboProductMaster.productCategory,
    productHsn: dboProductMaster.productHsn,
    lastPurchaseRate: dboProductMaster.lastPurchaseRate,
    supplierName: dboProductMaster.supplierName,
    unitOfMeasure: dboProductMaster.unitOfMeasure,
    currency: dboProductMaster.currency,
    manufacturerPartNumber: dboProductMaster.manufacturerPartNumber,
    leadTimeDays: dboProductMaster.leadTimeDays,
    minOrderQuantity: dboProductMaster.minOrderQuantity,
    status: dboProductMaster.status,
    isActive: dboProductMaster.isActive,
    taxCode: dboProductMaster.taxCode,
    taxRate: dboProductMaster.taxRate,
    creationTime: dboProductMaster.creationTime,
    lastModifiedDate: dboProductMaster.lastModifiedDate,
  };

  private toIsoTimestamp(value: Date | string | null | undefined): string | null {
    if (value == null) return null;
    if (value instanceof Date) return value.toISOString();
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  // Helper function to map DboProductMaster to Item type for UI compatibility
  private mapProductToItem(product: {
    id: string | number;
    skuNo?: string | null;
    productName?: string | null;
    productShortDesc?: string | null;
    productLongDesc?: string | null;
    productSpecification?: string | null;
    productCategory?: number | null;
    productHsn?: string | null;
    lastPurchaseRate?: string | null;
    supplierName?: string | null;
    unitOfMeasure?: string | null;
    currency?: string | null;
    manufacturerPartNumber?: string | null;
    leadTimeDays?: number | null;
    minOrderQuantity?: number | null;
    status?: string | null;
    isActive?: boolean | null;
    taxCode?: string | null;
    taxRate?: string | null;
    creationTime?: Date | string | null;
    lastModifiedDate?: Date | string | null;
  }): ItemWithSpecs {
    const id = String(product.id);
    let specifications = [];
    try {
      if (product.productSpecification) {
        specifications = JSON.parse(product.productSpecification);
      }
    } catch (e) {
      console.error("Error parsing specifications for product", id, e);
    }

    return {
      id,
      itemCode: product.skuNo || id,
      name: product.productName || "Unnamed Product",
      description: product.productShortDesc || product.productLongDesc || null,
      categoryCode: product.productCategory?.toString() || null,
      categoryName: null,
      unitOfMeasure: product.unitOfMeasure || "EA",
      standardPrice: product.lastPurchaseRate ? parseInt(product.lastPurchaseRate, 10) : null,
      currency: product.currency || "INR",
      manufacturer: product.supplierName || null,
      manufacturerPartNumber: product.manufacturerPartNumber || null,
      leadTimeDays: product.leadTimeDays || null,
      minOrderQuantity: product.minOrderQuantity || 1,
      status: product.status || "active",
      isActive: product.isActive ?? true,
      productSpecification: product.productSpecification || null,
      productHSN: product.productHsn || null,
      taxCode: product.taxCode || null,
      taxRate: product.taxRate || null,
      createdAt: this.toIsoTimestamp(product.creationTime) || new Date().toISOString(),
      updatedAt: this.toIsoTimestamp(product.lastModifiedDate),
    };
  }

  // Items (Item Master) - Database-backed from dbo.pm_product_master
  async getItems(): Promise<ItemWithSpecs[]> {
    const results = await getDb().select({
      ...this.itemProductColumns,
      categoryName: dboCatCategories.categoryName,
    })
      .from(dboProductMaster)
      .leftJoin(
        dboCatCategories,
        sql`${dboProductMaster.productCategory}::text = ${dboCatCategories.category_id}::text`
      )
      .where(
        and(
          sql`${dboProductMaster.productName} IS NOT NULL`,
          sql`${dboProductMaster.productName} != ''`
        )
      )
      .orderBy(asc(dboProductMaster.productName))
      .limit(500);

    return results.map(r => ({
      ...this.mapProductToItem(r),
      categoryName: r.categoryName || null,
    }));
  }

  async getItemsPaginated(options: {
    page: number;
    limit: number;
    search?: string;
    category?: string;
    status?: string;
  }): Promise<{ items: ItemWithSpecs[]; total: number; page: number; limit: number; totalPages: number }> {
    const { page, limit, search, category, status } = options;
    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions: any[] = [
      sql`${dboProductMaster.productName} IS NOT NULL`,
      sql`${dboProductMaster.productName} != ''`
    ];

    if (search) {
      const searchPattern = `%${search}%`;
      conditions.push(
        or(
          ilike(dboProductMaster.skuNo, searchPattern),
          ilike(dboProductMaster.productName, searchPattern),
          ilike(dboProductMaster.productShortDesc, searchPattern)
        )
      );
    }

    if (category && category !== 'all') {
      const categoryId = parseInt(category, 10);
      if (!isNaN(categoryId)) {
        conditions.push(eq(dboProductMaster.productCategory, categoryId));
      } else {
        conditions.push(sql`${dboProductMaster.productCategory}::text = ${category}`);
      }
    }

    if (status && status !== 'all') {
      conditions.push(eq(dboProductMaster.status, status));
    }

    const whereClause = and(...conditions);

    // Get total count
    const countResult = await getDb().select({ count: sql<number>`count(*)` })
      .from(dboProductMaster)
      .where(whereClause);

    const total = Number(countResult[0]?.count || 0);
    const totalPages = Math.ceil(total / limit);

    // Get paginated items with category names
    const paginatedIds = await getDb().select({ id: dboProductMaster.id })
      .from(dboProductMaster)
      .where(whereClause)
      .orderBy(asc(dboProductMaster.productName))
      .limit(limit)
      .offset(offset);

    if (paginatedIds.length === 0) {
      return { items: [], total, page, limit, totalPages };
    }

    const ids = paginatedIds.map((p: any) => p.id);
    
    // Now join with categories for exact paginated products
    const results = await getDb().select({
        ...this.itemProductColumns,
        categoryName: dboCatCategories.categoryName,
      })
      .from(dboProductMaster)
      .leftJoin(
        dboCatCategories,
        sql`${dboProductMaster.productCategory}::text = ${dboCatCategories.category_id}::text`
      )
      .where(inArray(dboProductMaster.id, ids));

    const sortedResults = ids.map((id: string | number) =>
      results.find((r) => String(r.id) === String(id))
    ).filter(Boolean);

    const items = sortedResults.map((r) => ({
      ...this.mapProductToItem(r),
      categoryName: r.categoryName || null,
    }));

    return { items, total, page, limit, totalPages };
  }

  async getItemCategoryStats(filters?: { search?: string; status?: string; category?: string }): Promise<{ categoryName: string; categoryCode: string; count: number }[]> {
    const conditions = [
      sql`${dboProductMaster.productName} IS NOT NULL`,
      sql`${dboProductMaster.productName} != ''`
    ];

    if (filters?.search) {
      conditions.push(
        sql`(
          ${dboProductMaster.skuNo} ILIKE ${'%' + filters.search + '%'} OR
          ${dboProductMaster.productName} ILIKE ${'%' + filters.search + '%'} OR
          ${dboProductMaster.productShortDesc} ILIKE ${'%' + filters.search + '%'}
        )`
      );
    }

    if (filters?.status && filters.status !== 'all') {
      conditions.push(eq(dboProductMaster.status, filters.status));
    }

    const results = await getDb().select({
      categoryCode: sql<string>`${dboProductMaster.productCategory}::text`,
      categoryName: dboPmCatCategories.name,
      count: sql<number>`count(*)`
    })
      .from(dboProductMaster)
      .leftJoin(
        dboPmCatCategories,
        sql`${dboProductMaster.productCategory}::text = ${dboPmCatCategories.code}`
      )
      .where(and(...conditions))
      .groupBy(dboProductMaster.productCategory, dboPmCatCategories.name)
      .orderBy(sql`count(*) DESC`)
      .limit(10);

    return results.map(r => ({
      categoryCode: r.categoryCode || '',
      categoryName: r.categoryName || 'Uncategorized',
      count: Number(r.count)
    }));
  }

  async getUncategorizedItemCount(filters?: { search?: string; status?: string; category?: string }): Promise<number> {
    const conditions = [
      sql`${dboProductMaster.productName} IS NOT NULL`,
      sql`${dboProductMaster.productName} != ''`,
      or(
        isNull(dboProductMaster.productCategory),
        eq(dboProductMaster.productCategory, 0)
      )
    ];

    if (filters?.search) {
      conditions.push(
        sql`(
          ${dboProductMaster.skuNo} ILIKE ${'%' + filters.search + '%'} OR
          ${dboProductMaster.productName} ILIKE ${'%' + filters.search + '%'} OR
          ${dboProductMaster.productShortDesc} ILIKE ${'%' + filters.search + '%'}
        )`
      );
    }

    if (filters?.status && filters.status !== 'all') {
      conditions.push(eq(dboProductMaster.status, filters.status));
    }

    const result = await getDb().select({
      count: sql<number>`count(*)`
    })
      .from(dboProductMaster)
      .where(and(...conditions));
    return Number(result[0]?.count || 0);
  }

  async getMissingSkuCount(filters?: { search?: string; status?: string; category?: string }): Promise<number> {
    const conditions = [
      sql`(${dboProductMaster.skuNo} IS NULL OR ${dboProductMaster.skuNo} = '')`,
      sql`${dboProductMaster.productName} IS NOT NULL`,
      sql`${dboProductMaster.productName} != ''`
    ];

    if (filters?.search) {
      conditions.push(
        sql`(
          ${dboProductMaster.productName} ILIKE ${'%' + filters.search + '%'} OR
          ${dboProductMaster.productShortDesc} ILIKE ${'%' + filters.search + '%'}
        )`
      );
    }

    if (filters?.status && filters.status !== 'all') {
      conditions.push(eq(dboProductMaster.status, filters.status));
    }

    const result = await getDb().select({
      count: sql<number>`count(*)`
    })
      .from(dboProductMaster)
      .where(and(...conditions));
    return Number(result[0]?.count || 0);
  }

  async getItemsByCategory(categoryCode: string): Promise<ItemWithSpecs[]> {
    const categoryId = parseInt(categoryCode);
    if (isNaN(categoryId)) {
      return [];
    }
    const results = await getDb().select({
      ...this.itemProductColumns,
      categoryName: dboCatCategories.categoryName,
    })
      .from(dboProductMaster)
      .leftJoin(
        dboCatCategories,
        sql`${dboProductMaster.productCategory}::text = ${dboCatCategories.category_id}::text`
      )
      .where(
        and(
          eq(dboProductMaster.productCategory, categoryId),
          sql`${dboProductMaster.productName} IS NOT NULL`,
          sql`${dboProductMaster.productName} != ''`
        )
      )
      .orderBy(asc(dboProductMaster.productName));
    return results.map(r => ({
      ...this.mapProductToItem(r),
      categoryName: r.categoryName || null,
    }));
  }

  async getItem(id: string): Promise<ItemWithSpecs | undefined> {
    const results = await getDb().select({
      ...this.itemProductColumns,
      categoryName: dboCatCategories.categoryName,
    })
      .from(dboProductMaster)
      .leftJoin(
        dboCatCategories,
        sql`${dboProductMaster.productCategory}::text = ${dboCatCategories.category_id}::text`
      )
      .where(eq(dboProductMaster.id, id));
    return results[0]
      ? { ...this.mapProductToItem(results[0]), categoryName: results[0].categoryName || null }
      : undefined;
  }

  async getItemByCode(itemCode: string): Promise<ItemWithSpecs | undefined> {
    const results = await getDb().select({
      ...this.itemProductColumns,
      categoryName: dboCatCategories.categoryName,
    })
      .from(dboProductMaster)
      .leftJoin(
        dboCatCategories,
        sql`${dboProductMaster.productCategory}::text = ${dboCatCategories.category_id}::text`
      )
      .where(eq(dboProductMaster.skuNo, itemCode));
    return results[0]
      ? { ...this.mapProductToItem(results[0]), categoryName: results[0].categoryName || null }
      : undefined;
  }

  async searchItems(query: string): Promise<ItemWithSpecs[]> {
      const results = await getDb().select({
      ...this.itemProductColumns,
      categoryName: dboCatCategories.categoryName,
    })
      .from(dboProductMaster)
      .leftJoin(
        dboCatCategories,
        sql`${dboProductMaster.productCategory}::text = ${dboCatCategories.category_id}::text`
      )
      .where(
        or(
          ilike(dboProductMaster.skuNo, `%${query}%`),
          ilike(dboProductMaster.productName, `%${query}%`),
          ilike(dboProductMaster.productShortDesc, `%${query}%`),
          ilike(dboProductMaster.supplierName, `%${query}%`)
        )
      )
      .orderBy(asc(dboProductMaster.productName))
      .limit(100);
    return results.map(r => ({
      ...this.mapProductToItem(r),
      categoryName: r.categoryName || null,
    }));
  }

  async createItem(insertItem: any): Promise<ItemWithSpecs> {
    const now = new Date();

    // Look up ITEMS prefix from prefix master
    const prefixResult = await getDb().execute(sql`
      SELECT prefix_value FROM dbo.am_prefix_mst
      WHERE UPPER(TRIM(prefix_name)) IN ('ITEMS', 'ITEM') AND status = 'Active'
      LIMIT 1
    `);
    const itemPrefix: string = ((prefixResult.rows[0] as any)?.prefix_value?.trim()) || '';

    // Extract max numeric sequence from existing IDs (handles both "00001" and "PREFIX_00001" formats)
    const maxResult = await getDb().execute(sql`
      SELECT COALESCE(MAX(
        CASE
          WHEN id ~ '^[0-9]+$' THEN CAST(id AS BIGINT)
          WHEN id ~ '^.*_([0-9]+)$' THEN CAST(REGEXP_REPLACE(id, '^.*_([0-9]+)$', '\\1') AS BIGINT)
          ELSE 0
        END
      ), 0) AS max_seq FROM dbo.pm_product_master
    `);
    const nextNum = Number((maxResult.rows[0] as any)?.max_seq || 0) + 1;
    const nextId = itemPrefix
      ? `${itemPrefix}_${String(nextNum).padStart(5, '0')}`
      : String(nextNum).padStart(5, '0');

      // Removed tax rate and tax code while item creation 
      // let taxRate = null;
      // let taxRateCode = null;
      // if(insertItem.taxCode){
      //   const taxResult = await getDb().execute(sql`SELECT * FROM dbo.am_tax_code_mapping_mst WHERE tax_code_id = ${insertItem.taxCode} AND status = 'Y' LIMIT 1`);
      //   taxRate = Number(taxResult.rows[0]?.tax_rate) || null;
      //   taxRateCode = taxResult.rows[0]?.tax_code || null;
      // }

    const result = await getDb().insert(dboProductMaster).values({
      id: nextId,
      skuNo: insertItem.itemCode,
      productName: insertItem.name,
      productShortDesc: insertItem.description || null,
      productCategory: insertItem.categoryCode ? parseInt(insertItem.categoryCode) : null,
      unitOfMeasure: insertItem.unitOfMeasure || "EA",
      currency: insertItem.currency || "INR",
      lastPurchaseRate: insertItem.standardPrice?.toString() || null,
      supplierName: insertItem.manufacturer || null,
      manufacturerPartNumber: insertItem.manufacturerPartNumber || null,
      leadTimeDays: insertItem.leadTimeDays || null,
      minOrderQuantity: insertItem.minOrderQuantity || 1,
      status: insertItem.status || "active",
      isActive: insertItem.isActive ?? true,
      productSpecification: insertItem.productSpecification || null,
      productHsn: insertItem.productHSN || null,
      creationTime: now,
    }).returning(this.itemProductColumns);
    return this.mapProductToItem(result[0]);
  }

  async updateItem(id: string, updates: Partial<ItemWithSpecs>): Promise<ItemWithSpecs | undefined> {
    const productId = parseInt(id);
    if (isNaN(productId)) return undefined;

    const updateValues: Record<string, unknown> = {};
    if (updates.itemCode !== undefined) updateValues.skuNo = updates.itemCode;
    if (updates.name !== undefined) updateValues.productName = updates.name;
    if (updates.description !== undefined) updateValues.productShortDesc = updates.description;
    if (updates.categoryCode !== undefined) {
      updateValues.productCategory = updates.categoryCode ? parseInt(updates.categoryCode) : null;
    }
    if (updates.unitOfMeasure !== undefined) updateValues.unitOfMeasure = updates.unitOfMeasure;
    if (updates.currency !== undefined) updateValues.currency = updates.currency;
    if (updates.standardPrice !== undefined) updateValues.lastPurchaseRate = updates.standardPrice?.toString() || null;
    if (updates.manufacturer !== undefined) updateValues.supplierName = updates.manufacturer;
    if (updates.manufacturerPartNumber !== undefined) updateValues.manufacturerPartNumber = updates.manufacturerPartNumber;
    if (updates.leadTimeDays !== undefined) updateValues.leadTimeDays = updates.leadTimeDays;
    if (updates.minOrderQuantity !== undefined) updateValues.minOrderQuantity = updates.minOrderQuantity;
    if (updates.status !== undefined) updateValues.status = updates.status;
    if (updates.isActive !== undefined) updateValues.isActive = updates.isActive;
    if (updates.productSpecification !== undefined) updateValues.productSpecification = updates.productSpecification;
    if (updates.productHSN !== undefined) updateValues.productHsn = updates.productHSN;
    if (updates.taxCode !== undefined) {
      const requestedTaxCode = typeof updates.taxCode === "string" ? updates.taxCode.trim() : updates.taxCode;

      // UI may send either tax_code_id (dropdown value) or tax_code; normalize both to pm_product_master.tax_code.
      if (!requestedTaxCode) {
        updateValues.taxCode = null;
        updateValues.taxRate = null;
      } else {
        const taxResult = await getDb().execute(sql`
          SELECT tax_code, tax_rate
          FROM dbo.am_tax_code_mapping_mst
          WHERE (tax_code_id = ${requestedTaxCode} OR tax_code = ${requestedTaxCode})
            AND status IN ('Y', 'Active')
          LIMIT 1
        `);
        const taxRow = taxResult.rows[0] as any;
        updateValues.taxCode = taxRow?.tax_code || requestedTaxCode;
        updateValues.taxRate = taxRow?.tax_rate !== undefined && taxRow?.tax_rate !== null
          ? Number(taxRow.tax_rate)
          : null;
      }
    }
    updateValues.lastModifiedDate = new Date();

    const result = await getDb().update(dboProductMaster)
      .set(updateValues)
      .where(eq(dboProductMaster.id, id))
      .returning(this.itemProductColumns);
    return result[0] ? this.mapProductToItem(result[0]) : undefined;
  }

  async deleteItem(id: string): Promise<boolean> {
    const result = await getDb().delete(dboProductMaster)
      .where(eq(dboProductMaster.id, id))
      .returning();
    return result.length > 0;
  }

}

export const storage = new MemStorage();
