/**
 * Prepends the MongoDB LeafyGreen Mermaid theme to every ```mermaid block
 * in the project docs. Palette source: @leafygreen-ui/palette / mongodb.design
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** MongoDB official LeafyGreen dark palette for diagram backgrounds. */
export const MONGODB_MERMAID_INIT = `%%{init:{"theme":"base","themeVariables":{"darkMode":true,"background":"#001E2B","mainBkg":"#023430","secondBkg":"#00684A","tertiaryBkg":"#112733","primaryColor":"#00684A","primaryTextColor":"#E3FCF7","primaryBorderColor":"#00ED64","secondaryColor":"#023430","secondaryTextColor":"#E3FCF7","secondaryBorderColor":"#00A35C","tertiaryColor":"#112733","tertiaryTextColor":"#C0FAE6","tertiaryBorderColor":"#00ED64","lineColor":"#00ED64","textColor":"#E3FCF7","nodeTextColor":"#E3FCF7","clusterBkg":"#112733","clusterBorder":"#00ED64","titleColor":"#00ED64","edgeLabelBackground":"#023430","nodeBorder":"#00ED64","actorBkg":"#00684A","actorBorder":"#00ED64","actorTextColor":"#E3FCF7","signalColor":"#00ED64","labelBoxBkgColor":"#023430","labelBoxBorderColor":"#00ED64","labelTextColor":"#E3FCF7","loopTextColor":"#E3FCF7","noteBkgColor":"#112733","noteBorderColor":"#00ED64","noteTextColor":"#E3FCF7","activationBkgColor":"#00A35C","activationBorderColor":"#00ED64","sequenceNumberColor":"#E3FCF7","attributeBackgroundColorOdd":"#023430","attributeBackgroundColorEven":"#112733","classText":"#E3FCF7","classLabelColor":"#00ED64"}}}%%`;

const MARKER = '%%{init:{"theme":"base"';

const FILES = [
  join(ROOT, 'README.md'),
  join(ROOT, 'docs/README.md'),
  join(ROOT, 'docs/diagrams.md'),
];

for (const filePath of FILES) {
  let content = readFileSync(filePath, 'utf8');
  content = content.replace(/```mermaid\n/g, (match, offset) => {
    const after = content.slice(offset + match.length, offset + match.length + 200);
    if (after.startsWith(MARKER)) return match;
    return `${match}${MONGODB_MERMAID_INIT}\n`;
  });
  writeFileSync(filePath, content);
  console.log(`Themed: ${filePath}`);
}
