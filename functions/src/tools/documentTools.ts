/**
 * Field schemas per document type — mirrors DOCUMENT_FIELDS_MAP in form-assistant.tsx.
 * Used by the document agent to know which fields to generate for form-fill mode.
 */

export const DOCUMENT_FIELDS: Record<string, {key: string; label: string}[]> = {
  mykad: [
    {key: "fullName", label: "Full Name"},
    {key: "icNumber", label: "IC Number"},
    {key: "dateOfBirth", label: "Date of Birth"},
    {key: "address", label: "Address"},
  ],
  be_form: [
    {key: "icNumber", label: "IC Number"},
    {key: "fullName", label: "Full Name"},
    {key: "dateOfBirth", label: "Date of Birth"},
    {key: "maritalStatus", label: "Marital Status"},
    {key: "spouseIC", label: "Spouse IC"},
    {key: "spouseName", label: "Spouse Name"},
    {key: "address", label: "Address"},
    {key: "postcode", label: "Postcode"},
  ],
  ea_form: [
    {key: "icNumber", label: "IC Number"},
    {key: "fullName", label: "Full Name"},
    {key: "dateOfBirth", label: "Date of Birth"},
    {key: "taxIdentificationNumber", label: "Tax Identification Number (TIN)"},
    {key: "eaForm", label: "EA Form"},
    {key: "address", label: "Address"},
    {key: "postcode", label: "Postcode"},
  ],
  tax_return: [
    {key: "icNumber", label: "IC Number"},
    {key: "fullName", label: "Full Name"},
    {key: "dateOfBirth", label: "Date of Birth"},
    {key: "taxIdentificationNumber", label: "Tax Identification Number (TIN)"},
    {key: "bankAccountNumber", label: "Bank Account Number"},
    {key: "nameOfBank", label: "Name of Bank"},
    {key: "bankHolderName", label: "Bank Holder Name"},
  ],
  medical_claim: [
    {key: "icNumber", label: "IC Number"},
    {key: "fullName", label: "Full Name"},
    {key: "dateOfBirth", label: "Date of Birth"},
  ],
  employment_cert: [
    {key: "icNumber", label: "IC Number"},
    {key: "fullName", label: "Full Name"},
    {key: "dateOfBirth", label: "Date of Birth"},
    {key: "address", label: "Address"},
    {key: "bankAccountNumber", label: "Bank Account Number"},
  ],
  license_app: [
    {key: "icNumber", label: "IC Number"},
    {key: "fullName", label: "Full Name"},
    {key: "dateOfBirth", label: "Date of Birth"},
    {key: "address", label: "Address"},
    {key: "postcode", label: "Postcode"},
  ],
  passport: [
    {key: "passportNumber", label: "Passport Number"},
    {key: "fullName", label: "Full Name"},
    {key: "dateOfBirth", label: "Date of Birth"},
    {key: "nationality", label: "Nationality"},
    {key: "gender", label: "Gender"},
    {key: "issueDate", label: "Issue Date"},
    {key: "expiryDate", label: "Expiry Date"},
  ],
  license: [
    {key: "licenseNumber", label: "License Number"},
    {key: "icNumber", label: "IC Number"},
    {key: "fullName", label: "Full Name"},
    {key: "categories", label: "License Categories"},
    {key: "issueDate", label: "Issue Date"},
    {key: "expiryDate", label: "Expiry Date"},
  ],
  birth_cert: [
    {key: "registrationNumber", label: "Registration Number"},
    {key: "fullName", label: "Full Name"},
    {key: "dateOfBirth", label: "Date of Birth"},
    {key: "placeOfBirth", label: "Place of Birth"},
    {key: "fatherName", label: "Father's Name"},
    {key: "motherName", label: "Mother's Name"},
  ],
  utility_bill: [
    {key: "accountNumber", label: "Account Number"},
    {key: "customerName", label: "Customer Name"},
    {key: "address", label: "Address"},
    {key: "billingPeriod", label: "Billing Period"},
    {key: "amount", label: "Amount"},
    {key: "dueDate", label: "Due Date"},
  ],
  other: [
    {key: "title", label: "Document Title"},
    {key: "content", label: "Content Summary"},
  ],
};

/**
 * Maps scanner client types to server document type keys.
 * Fixes latent bug: scanner sends "identity" but DOCUMENT_FIELDS["identity"] doesn't exist.
 */
export const SCANNER_TYPE_MAP: Record<string, string> = {
  identity: "mykad",
  passport: "passport",
  license: "license",
  birth: "birth_cert",
  utility: "utility_bill",
  other: "other",
};

/** Resolves a client-side document type to a server-side key. */
export function resolveDocumentType(clientType: string): string {
  return SCANNER_TYPE_MAP[clientType] || clientType;
}

/** Returns the list of field keys for a given document type. */
export function getFieldKeysForDocument(docType: string): string[] {
  return (DOCUMENT_FIELDS[docType] || []).map((f) => f.key);
}

/** Returns a human-readable description of required fields for a document type. */
export function describeFieldsForDocument(docType: string): string {
  const fields = DOCUMENT_FIELDS[docType];
  if (!fields) return "Unknown document type.";
  return fields.map((f) => `- ${f.label} (${f.key})`).join("\n");
}
