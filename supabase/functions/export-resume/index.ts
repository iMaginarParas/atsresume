import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticateRequest } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface PersonalInfo {
  fullName?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  portfolio?: string;
}

interface ExperienceItem {
  title: string;
  company: string;
  startDate?: string;
  endDate?: string;
  description: string;
  bullets: string[];
}

interface EducationItem {
  degree: string;
  school: string;
  startDate?: string;
  endDate?: string;
  year?: string;
}

interface CustomSection {
  id: string;
  title: string;
  items: string[];
}

interface LanguageItem {
  name: string;
  proficiency: string;
}

interface ResumeData {
  personalInfo?: PersonalInfo;
  summary?: string;
  skills?: string[];
  experience?: ExperienceItem[];
  education?: EducationItem[];
  customSections?: CustomSection[];
  languages?: LanguageItem[];
}

type SectionId = "summary" | "skills" | "experience" | "education" | "languages" | "custom";

const DEFAULT_SECTION_ORDER: SectionId[] = ["summary", "skills", "experience", "education", "languages", "custom"];

function formatDateRange(start?: string, end?: string): string {
  if (!start && !end) return "";
  const s = start || "";
  const e = end || "Present";
  return `${s} – ${e}`;
}

// ─── Validation ────────────────────────────────────────────────────────────
function validateResumeData(data: ResumeData): string[] {
  const errors: string[] = [];
  const pi = data.personalInfo || {};
  if (!pi.fullName?.trim()) errors.push("Full name is required");
  if (!pi.email?.trim()) errors.push("Email is required");
  if ((!data.experience || data.experience.length === 0) && (!data.education || data.education.length === 0)) {
    errors.push("At least one experience or education entry is required");
  }
  return errors;
}

// ─── Plain Text Builder ────────────────────────────────────────────────────
function buildPlainText(data: ResumeData, sectionOrder: SectionId[] = DEFAULT_SECTION_ORDER): string {
  const lines: string[] = [];
  const pi = data.personalInfo || {};

  lines.push((pi.fullName || "").toUpperCase());
  const contact = [pi.email, pi.phone, pi.location].filter(Boolean).join(" | ");
  if (contact) lines.push(contact);
  const links = [pi.linkedin, pi.portfolio].filter(Boolean).join(" | ");
  if (links) lines.push(links);
  lines.push("");

  const sectionBuilders: Record<SectionId, () => void> = {
    summary: () => {
      if (data.summary) {
        lines.push("PROFESSIONAL SUMMARY");
        lines.push("─".repeat(40));
        lines.push(data.summary);
        lines.push("");
      }
    },
    skills: () => {
      if (data.skills?.length) {
        lines.push("SKILLS");
        lines.push("─".repeat(40));
        lines.push(data.skills.join(", "));
        lines.push("");
      }
    },
    experience: () => {
      if (data.experience?.length) {
        lines.push("EXPERIENCE");
        lines.push("─".repeat(40));
        for (const exp of data.experience) {
          const dateStr = formatDateRange(exp.startDate, exp.endDate);
          lines.push(`${exp.title} — ${exp.company}${dateStr ? `  (${dateStr})` : ""}`);
          if (exp.bullets?.length) {
            for (const b of exp.bullets) lines.push(`  • ${b}`);
          } else if (exp.description) {
            lines.push(`  ${exp.description}`);
          }
          lines.push("");
        }
      }
    },
    education: () => {
      if (data.education?.length) {
        lines.push("EDUCATION");
        lines.push("─".repeat(40));
        for (const edu of data.education) {
          const dateStr = formatDateRange(edu.startDate, edu.endDate) || edu.year || "";
          lines.push(`${edu.degree} — ${edu.school}${dateStr ? `  (${dateStr})` : ""}`);
        }
        lines.push("");
      }
    },
    languages: () => {
      if (data.languages?.length) {
        lines.push("LANGUAGES");
        lines.push("─".repeat(40));
        lines.push(data.languages.map((l) => `${l.name}${l.proficiency ? ` (${l.proficiency})` : ""}`).join(", "));
        lines.push("");
      }
    },
    custom: () => {
      if (data.customSections?.length) {
        for (const sec of data.customSections) {
          if (!sec.title) continue;
          lines.push(sec.title.toUpperCase());
          lines.push("─".repeat(40));
          for (const item of sec.items.filter(Boolean)) lines.push(`  • ${item}`);
          lines.push("");
        }
      }
    },
  };

  for (const sectionId of sectionOrder) {
    sectionBuilders[sectionId]();
  }

  return lines.join("\n");
}

// ─── DOCX XML Builder (ATS-safe Office Open XML) ──────────────────────────
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function docxParagraph(text: string, opts?: { bold?: boolean; size?: number; heading?: boolean; spacing?: number }): string {
  const sz = (opts?.size || 20) * 2; // half-points
  const bold = opts?.bold ? "<w:b/>" : "";
  const spacing = opts?.spacing ? `<w:spacing w:after="${opts.spacing}"/>` : "";
  return `<w:p><w:pPr>${spacing}<w:rPr>${bold}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr></w:pPr><w:r><w:rPr>${bold}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function docxBullet(text: string): string {
  return `<w:p><w:pPr><w:pStyle w:val="ListBullet"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function sectionHeading(text: string): string {
  return `<w:p><w:pPr><w:spacing w:before="240" w:after="60"/><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="auto"/></w:pBdr><w:rPr><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>${escapeXml(text.toUpperCase())}</w:t></w:r></w:p>`;
}

function buildDocxContent(data: ResumeData, sectionOrder: SectionId[] = DEFAULT_SECTION_ORDER): string {
  const parts: string[] = [];
  const pi = data.personalInfo || {};

  // Name
  parts.push(docxParagraph(pi.fullName || "", { bold: true, size: 14, spacing: 40 }));

  // Contact
  const contact = [pi.email, pi.phone, pi.location].filter(Boolean).join("  |  ");
  if (contact) parts.push(docxParagraph(contact, { size: 9 }));
  const links = [pi.linkedin, pi.portfolio].filter(Boolean).join("  |  ");
  if (links) parts.push(docxParagraph(links, { size: 9 }));

  const sectionBuilders: Record<SectionId, () => void> = {
    summary: () => {
      if (data.summary) {
        parts.push(sectionHeading("Professional Summary"));
        parts.push(docxParagraph(data.summary, { size: 10 }));
      }
    },
    skills: () => {
      if (data.skills?.length) {
        parts.push(sectionHeading("Skills"));
        parts.push(docxParagraph(data.skills.join(", "), { size: 10 }));
      }
    },
    experience: () => {
      if (data.experience?.length) {
        parts.push(sectionHeading("Experience"));
        for (const exp of data.experience) {
          const dateStr = formatDateRange(exp.startDate, exp.endDate);
          parts.push(docxParagraph(`${exp.title} — ${exp.company}${dateStr ? `  (${dateStr})` : ""}`, { bold: true, size: 10 }));
          if (exp.bullets?.length) {
            for (const b of exp.bullets) parts.push(docxBullet(b));
          } else if (exp.description) {
            parts.push(docxParagraph(exp.description, { size: 10 }));
          }
        }
      }
    },
    education: () => {
      if (data.education?.length) {
        parts.push(sectionHeading("Education"));
        for (const edu of data.education) {
          const dateStr = formatDateRange(edu.startDate, edu.endDate) || edu.year || "";
          parts.push(docxParagraph(`${edu.degree} — ${edu.school}${dateStr ? `  (${dateStr})` : ""}`, { bold: true, size: 10 }));
        }
      }
    },
    languages: () => {
      if (data.languages?.length) {
        parts.push(sectionHeading("Languages"));
        parts.push(docxParagraph(data.languages.map((l) => `${l.name}${l.proficiency ? ` (${l.proficiency})` : ""}`).join(", "), { size: 10 }));
      }
    },
    custom: () => {
      if (data.customSections?.length) {
        for (const sec of data.customSections) {
          if (!sec.title) continue;
          parts.push(sectionHeading(sec.title));
          for (const item of sec.items.filter(Boolean)) parts.push(docxBullet(item));
        }
      }
    },
  };

  for (const sectionId of sectionOrder) {
    sectionBuilders[sectionId]();
  }

  return parts.join("");
}

function buildDocxZip(bodyContent: string): Uint8Array {
  // Minimal DOCX is a ZIP with specific XML files
  // We'll build it using raw ZIP construction (no external deps)
  
  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const wordRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`;

  const numberingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>`;

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${bodyContent}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const files: { path: string; content: string }[] = [
    { path: "[Content_Types].xml", content: contentTypesXml },
    { path: "_rels/.rels", content: relsXml },
    { path: "word/_rels/document.xml.rels", content: wordRelsXml },
    { path: "word/document.xml", content: documentXml },
    { path: "word/numbering.xml", content: numberingXml },
  ];

  return createZip(files);
}

// Minimal ZIP file creation (store method, no compression needed for small XML)
function createZip(files: { path: string; content: string }[]): Uint8Array {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const centralDir: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.path);
    const dataBytes = encoder.encode(file.content);
    const crc = crc32(dataBytes);

    // Local file header
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lhView = new DataView(localHeader.buffer);
    lhView.setUint32(0, 0x04034b50, true); // signature
    lhView.setUint16(4, 20, true); // version needed
    lhView.setUint16(6, 0, true); // flags
    lhView.setUint16(8, 0, true); // compression (store)
    lhView.setUint16(10, 0, true); // mod time
    lhView.setUint16(12, 0, true); // mod date
    lhView.setUint32(14, crc, true); // crc32
    lhView.setUint32(18, dataBytes.length, true); // compressed size
    lhView.setUint32(22, dataBytes.length, true); // uncompressed size
    lhView.setUint16(26, nameBytes.length, true); // filename length
    lhView.setUint16(28, 0, true); // extra field length
    localHeader.set(nameBytes, 30);

    parts.push(localHeader, dataBytes);

    // Central directory entry
    const cdEntry = new Uint8Array(46 + nameBytes.length);
    const cdView = new DataView(cdEntry.buffer);
    cdView.setUint32(0, 0x02014b50, true);
    cdView.setUint16(4, 20, true);
    cdView.setUint16(6, 20, true);
    cdView.setUint16(8, 0, true);
    cdView.setUint16(10, 0, true);
    cdView.setUint16(12, 0, true);
    cdView.setUint16(14, 0, true);
    cdView.setUint32(16, crc, true);
    cdView.setUint32(20, dataBytes.length, true);
    cdView.setUint32(24, dataBytes.length, true);
    cdView.setUint16(28, nameBytes.length, true);
    cdView.setUint16(30, 0, true);
    cdView.setUint16(32, 0, true);
    cdView.setUint16(34, 0, true);
    cdView.setUint16(36, 0, true);
    cdView.setUint32(38, 0x20, true);
    cdView.setUint32(42, offset, true);
    cdEntry.set(nameBytes, 46);

    centralDir.push(cdEntry);
    offset += localHeader.length + dataBytes.length;
  }

  const cdOffset = offset;
  let cdSize = 0;
  for (const cd of centralDir) cdSize += cd.length;

  // End of central directory
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(4, 0, true);
  eocdView.setUint16(6, 0, true);
  eocdView.setUint16(8, files.length, true);
  eocdView.setUint16(10, files.length, true);
  eocdView.setUint32(12, cdSize, true);
  eocdView.setUint32(16, cdOffset, true);
  eocdView.setUint16(20, 0, true);

  const totalSize = offset + cdSize + 22;
  const result = new Uint8Array(totalSize);
  let pos = 0;
  for (const p of parts) { result.set(p, pos); pos += p.length; }
  for (const cd of centralDir) { result.set(cd, pos); pos += cd.length; }
  result.set(eocd, pos);

  return result;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user, errorResponse } = await authenticateRequest(req, corsHeaders);
    if (errorResponse) return errorResponse;

    const { resumeData, format, sectionOrder } = await req.json();
    const order: SectionId[] = Array.isArray(sectionOrder) ? sectionOrder : DEFAULT_SECTION_ORDER;

    if (!resumeData || !format) {
      return new Response(JSON.stringify({ error: "Missing resumeData or format" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["txt", "docx"].includes(format)) {
      return new Response(JSON.stringify({ error: "Unsupported format. Use txt or docx." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate
    const errors = validateResumeData(resumeData);
    if (errors.length > 0) {
      return new Response(JSON.stringify({ error: "Validation failed", validationErrors: errors }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (format === "txt") {
      const text = buildPlainText(resumeData, order);
      const base64 = btoa(unescape(encodeURIComponent(text)));
      return new Response(JSON.stringify({ data: base64, mimeType: "text/plain" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (format === "docx") {
      const bodyXml = buildDocxContent(resumeData, order);
      const zipBytes = buildDocxZip(bodyXml);
      const base64 = btoa(String.fromCharCode(...zipBytes));
      return new Response(
        JSON.stringify({
          data: base64,
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Unknown format" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Export error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
