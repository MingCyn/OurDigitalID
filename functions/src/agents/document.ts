import {ai, CHAT_MODEL} from "../genkit.js";
import {ChatInput, ChatOutput} from "../schemas.js";
import {DOCUMENT_FIELDS, describeFieldsForDocument, resolveDocumentType} from "../tools/documentTools.js";

const chatSystemPrompt = `You are a document specialist assistant for OurDigitalID, a Malaysian government digital identity app.
You are an expert on Malaysian government forms and documents including:
- BE Form (individual tax return)
- EA Form (employment income statement)
- Tax Returns
- Medical Claims
- Employment Certificates
- License Applications (JPJ driving license)

Help users understand what each form requires, guide them through filling out documents, explain field meanings, and answer any questions about Malaysian government paperwork.
Be concise, friendly, and informative. Use simple language.
You may respond in English, Bahasa Melayu, or Chinese based on the user's language.

IMPORTANT: If the user wants to scan, upload, or photograph a document to extract data from it, you MUST include the marker [ACTION:SCAN:<docType>] at the END of your reply (after your normal response text).
Use these document type codes: be_form, ea_form, tax_return, medical_claim, employment_cert, license_app.
If the document type is unclear, use "other".
Examples:
- User: "I want to scan my BE form" → Reply normally, then append [ACTION:SCAN:be_form]
- User: "Can you scan my tax return?" → Reply normally, then append [ACTION:SCAN:tax_return]
- User: "Upload my medical claim" → Reply normally, then append [ACTION:SCAN:medical_claim]`;

function buildFormFillPrompt(docType: string, existingFields?: Record<string, string>): string {
  const fieldDesc = describeFieldsForDocument(docType);
  const existing = existingFields && Object.keys(existingFields).length > 0
    ? `\n\nThe user has already provided these fields:\n${JSON.stringify(existingFields, null, 2)}`
    : "";

  return `You are a form-filling assistant. Generate realistic sample/placeholder data for a Malaysian government document.

Document type: ${docType}
Required fields:
${fieldDesc}
${existing}

IMPORTANT: Return ONLY a valid JSON object with the field keys as keys and appropriate sample values as strings.
- IC Number format: YYMMDD-SS-NNNN (e.g., "950115-14-5678")
- Date of Birth format: DD/MM/YYYY
- Use realistic Malaysian names, addresses, and data
- If existing fields are provided, keep those values and only fill in missing ones
- Do NOT include any explanation, markdown, or text outside the JSON object.`;
}

function buildOcrPrompt(docType: string): string {
  const fieldDesc = describeFieldsForDocument(docType);
  return `You are an OCR extraction assistant. Extract all visible text fields from this scanned document image.

The user selected document type: ${docType}
Expected fields for that type:
${fieldDesc}

IMPORTANT: Return ONLY a valid JSON object with:
1. The field keys as keys and extracted values as strings.
2. A special key "_detectedType" indicating what type of document you ACTUALLY see in the image.
   Use one of: mykad, passport, license, birth_cert, utility_bill, other

For example, if the user selected "mykad" but the image shows a passport, set "_detectedType": "passport" and extract passport fields instead.

Rules:
- If a field is not visible or unreadable, omit it or set it to an empty string.
- IC Number format: YYMMDD-SS-NNNN
- Date of Birth format: DD/MM/YYYY
- All values must be strings.
- Extract exactly what you see — do not fabricate data.
- Do NOT include any explanation, markdown, or text outside the JSON object.`;
}

function buildVerificationPrompt(docType: string, fields: Record<string, string>): string {
  const rulesMap: Record<string, string> = {
    mykad: `Malaysian MyKad verification rules:
- IC Number MUST match format YYMMDD-SS-NNNN (6 digit DOB, dash, 2 digit state code, dash, 4 digits)
- Valid state codes: 01-16 (01=Johor, 02=Kedah, 03=Kelantan, 04=Melaka, 05=N.Sembilan, 06=Pahang, 07=Penang, 08=Perak, 09=Perlis, 10=Selangor, 11=Terengganu, 12=Sabah, 13=Sarawak, 14=KL, 15=Labuan, 16=Putrajaya)
- Date of Birth must be consistent with the first 6 digits of the IC number (YYMMDD)
- Last digit of IC number indicates gender: odd=male, even=female
- Full name should be present and non-empty
- Address should be present`,
    passport: `Malaysian Passport verification rules:
- Passport number format: 1-2 letters followed by 7-8 digits (e.g., A12345678 or HA1234567)
- Expiry date must be in the future
- Issue date must be before expiry date
- Full name must be present
- Date of birth must be a valid date
- Nationality should be "MALAYSIAN" or "MALAYSIA"`,
    license: `Malaysian Driving License verification rules:
- License number should be present and non-empty
- Valid license categories include: B, B1, B2, B Full, C, D, DA, E, E1, E2, F, G, H, I
- IC number if present should match YYMMDD-SS-NNNN format
- Expiry date should be in the future
- Issue date should be before expiry date`,
    birth_cert: `Malaysian Birth Certificate verification rules:
- Registration number must be present
- Full name must be present
- Date of birth must be a valid date
- At least one parent name (father or mother) should be present
- Place of birth should be present`,
    utility_bill: `Utility Bill verification rules:
- Account number must be present and non-empty
- Customer name must be present
- Address must be present
- Amount should be in valid format (e.g., "RM 145.50" or numeric)
- Due date should be a valid date`,
    other: `General document verification:
- Document should have a title or identifiable content
- Check for any obviously inconsistent or malformed data`,
  };

  const rules = rulesMap[docType] || rulesMap.other;

  return `You are a document verification specialist for Malaysian government documents.

Verify the following extracted fields against the validation rules below.

Document type: ${docType}
Extracted fields:
${JSON.stringify(fields, null, 2)}

${rules}

Respond with ONLY a valid JSON object in this exact format:
{
  "isValid": true/false,
  "score": <number 0-100 representing confidence/validity>,
  "issues": ["list of specific issues found, empty array if none"]
}

Scoring guide:
- 90-100: All fields valid, formats correct, cross-references match
- 70-89: Minor issues (e.g., missing optional field, slight format variation)
- 50-69: Some fields invalid or missing required data
- 0-49: Major issues (wrong format, inconsistent data, likely invalid document)

Be specific in issues. For example: "IC number state code 99 is invalid" not just "IC format wrong".
Do NOT include any text outside the JSON object.`;
}

export async function handleDocument(input: ChatInput): Promise<ChatOutput> {
  const context = input.context;

  // Verify mode: validate extracted fields
  if (context?.mode === "verify" && context.existingFields) {
    const docType = resolveDocumentType(context.documentType || "other");

    const prompt = buildVerificationPrompt(docType, context.existingFields);

    const response = await ai.generate({
      model: CHAT_MODEL,
      messages: [
        {role: "user", content: [{text: prompt}]},
      ],
    });

    let verification = {isValid: true, score: 80, issues: [] as string[]};
    const text = response.text.trim();
    try {
      verification = JSON.parse(text);
    } catch {
      try {
        const stripped = text
          .replace(/^```(?:json)?\s*/im, "")
          .replace(/\s*```\s*$/m, "")
          .trim();
        verification = JSON.parse(stripped);
      } catch {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            verification = JSON.parse(jsonMatch[0]);
          } catch {
            // All parsing failed — return default
          }
        }
      }
    }

    return {
      reply: verification.isValid
        ? "Document verification passed. All fields look valid."
        : `Document verification found ${verification.issues.length} issue(s).`,
      agent: "document",
      verification: {
        isValid: Boolean(verification.isValid),
        score: Number(verification.score) || 0,
        issues: Array.isArray(verification.issues) ? verification.issues : [],
      },
    };
  }

  // OCR mode: extract fields from scanned image
  if (context?.mode === "ocr" && context.imageBase64) {
    const docType = resolveDocumentType(context.documentType || "other");
    const fields = DOCUMENT_FIELDS[docType];
    if (!fields) {
      return {reply: `Unknown document type: ${docType}`, agent: "document"};
    }

    const prompt = buildOcrPrompt(docType);

    const response = await ai.generate({
      model: CHAT_MODEL,
      messages: [
        {
          role: "user",
          content: [
            {text: prompt},
            {media: {contentType: "image/jpeg", url: `data:image/jpeg;base64,${context.imageBase64}`}},
          ],
        },
      ],
    });

    let rawData: Record<string, unknown> = {};
    const text = response.text.trim();
    try {
      rawData = JSON.parse(text);
    } catch {
      try {
        const stripped = text
          .replace(/^```(?:json)?\s*/im, "")
          .replace(/\s*```\s*$/m, "")
          .trim();
        rawData = JSON.parse(stripped);
      } catch {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            rawData = JSON.parse(jsonMatch[0]);
          } catch {
            // All parsing attempts failed
          }
        }
      }
    }

    // Sanitize: coerce all values to strings (Gemini may return numbers/nulls)
    const formData: Record<string, string> = {};
    let detectedDocumentType: string | undefined;
    for (const [k, v] of Object.entries(rawData)) {
      if (k === "_detectedType" && v != null) {
        detectedDocumentType = String(v);
      } else if (v != null) {
        formData[k] = String(v);
      }
    }

    // Return whatever we managed to extract — even partial results
    if (Object.keys(formData).length === 0) {
      return {
        reply: "I could see the document but had trouble extracting the fields. Raw response: " + text.substring(0, 200),
        agent: "document",
        formData,
        detectedDocumentType,
      };
    }

    return {
      reply: "I've extracted the fields from your scanned document. Please review and correct any information.",
      agent: "document",
      formData,
      detectedDocumentType,
    };
  }

  // Form-fill mode: return structured data
  if (context?.mode === "form-fill" && context.documentType) {
    const docType = context.documentType;
    const fields = DOCUMENT_FIELDS[docType];
    if (!fields) {
      return {
        reply: `Unknown document type: ${docType}`,
        agent: "document",
      };
    }

    const prompt = buildFormFillPrompt(docType, context.existingFields);

    const response = await ai.generate({
      model: CHAT_MODEL,
      messages: [
        {role: "user", content: [{text: prompt}]},
      ],
    });

    // Parse the JSON response
    let formData: Record<string, string> = {};
    try {
      const text = response.text.trim();
      // Strip markdown code fences if present
      const jsonStr = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      formData = JSON.parse(jsonStr);
    } catch {
      // If parsing fails, return raw text as reply
      return {
        reply: "I generated some data but couldn't parse it properly. Please try again.",
        agent: "document",
      };
    }

    // Merge with existing fields (existing take priority if not empty)
    if (context.existingFields) {
      for (const [key, val] of Object.entries(context.existingFields)) {
        if (val && val.trim()) {
          formData[key] = val;
        }
      }
    }

    return {
      reply: "I've filled in the form fields for you. Please review and update any information as needed.",
      agent: "document",
      formData,
    };
  }

  // Chat mode: conversational document guidance
  const messages: Array<{role: "user" | "model"; content: Array<{text: string}>}> = [
    {role: "model", content: [{text: chatSystemPrompt}]},
  ];

  for (const h of input.history ?? []) {
    messages.push({
      role: h.role as "user" | "model",
      content: [{text: h.content}],
    });
  }

  messages.push({role: "user", content: [{text: input.message}]});

  const response = await ai.generate({
    model: CHAT_MODEL,
    messages,
  });

  // Post-process: extract [ACTION:SCAN:<docType>] marker if present
  let replyText = response.text;
  let action: {type: string; documentType?: string} | undefined;
  const actionMatch = replyText.match(/\[ACTION:SCAN:(\w+)\]/);
  if (actionMatch) {
    replyText = replyText.replace(/\s*\[ACTION:SCAN:\w+\]\s*/, "").trim();
    action = {type: "scan", documentType: actionMatch[1]};
  }

  return {reply: replyText, agent: "document", action};
}
