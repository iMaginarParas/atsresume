const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = require("docx");

function buildPlainText(data) {
  let text = `${data.personalInfo?.fullName || "Resume"}\n`;
  text += `${data.personalInfo?.email || ""} | ${data.personalInfo?.phone || ""} | ${data.personalInfo?.location || ""}\n`;
  if (data.personalInfo?.linkedin) text += `LinkedIn: ${data.personalInfo.linkedin}\n`;
  if (data.personalInfo?.portfolio) text += `Portfolio: ${data.personalInfo.portfolio}\n`;
  text += `\n`;

  if (data.summary) {
    text += `SUMMARY\n=======\n${data.summary}\n\n`;
  }

  if (data.skills?.length) {
    text += `SKILLS\n======\n${data.skills.join(" • ")}\n\n`;
  }

  if (data.experience?.length) {
    text += `EXPERIENCE\n==========\n`;
    data.experience.forEach(exp => {
      text += `${exp.title} | ${exp.company} | ${exp.startDate || ""} - ${exp.endDate || ""}\n`;
      if (exp.bullets?.length) {
        exp.bullets.forEach(b => text += `• ${b}\n`);
      } else if (exp.description) {
        text += `${exp.description}\n`;
      }
      text += `\n`;
    });
  }

  if (data.education?.length) {
    text += `EDUCATION\n=========\n`;
    data.education.forEach(edu => {
      text += `${edu.degree} | ${edu.school} | ${edu.year || ""}\n\n`;
    });
  }

  if (data.languages?.length) {
    text += `LANGUAGES\n=========\n`;
    text += data.languages.map(l => `${l.name}${l.proficiency ? ` (${l.proficiency})` : ""}`).join(", ");
    text += `\n\n`;
  }

  return text;
}

async function buildDocx(data) {
  const children = [];

  // Header
  children.push(new Paragraph({
    text: data.personalInfo?.fullName || "Resume",
    heading: HeadingLevel.HEADING_1,
    alignment: AlignmentType.CENTER,
  }));

  const contact = [data.personalInfo?.email, data.personalInfo?.phone, data.personalInfo?.location].filter(Boolean).join(" | ");
  children.push(new Paragraph({
    text: contact,
    alignment: AlignmentType.CENTER,
  }));

  if (data.summary) {
    children.push(new Paragraph({ text: "SUMMARY", heading: HeadingLevel.HEADING_2 }));
    children.push(new Paragraph({ text: data.summary }));
  }

  if (data.skills?.length) {
    children.push(new Paragraph({ text: "SKILLS", heading: HeadingLevel.HEADING_2 }));
    children.push(new Paragraph({ text: data.skills.join(" • ") }));
  }

  if (data.experience?.length) {
    children.push(new Paragraph({ text: "EXPERIENCE", heading: HeadingLevel.HEADING_2 }));
    data.experience.forEach(exp => {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: exp.title, bold: true }),
          new TextRun({ text: ` | ${exp.company} | ${exp.startDate || ""} - ${exp.endDate || ""}` }),
        ],
      }));
      if (exp.bullets?.length) {
        exp.bullets.forEach(b => {
          children.push(new Paragraph({ text: b, bullet: { level: 0 } }));
        });
      }
    });
  }

  if (data.education?.length) {
    children.push(new Paragraph({ text: "EDUCATION", heading: HeadingLevel.HEADING_2 }));
    data.education.forEach(edu => {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: edu.degree, bold: true }),
          new TextRun({ text: ` | ${edu.school} | ${edu.year || ""}` }),
        ],
      }));
    });
  }

  const doc = new Document({
    sections: [{
      properties: {},
      children: children,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  return buffer.toString("base64");
}

module.exports = { buildPlainText, buildDocx };
