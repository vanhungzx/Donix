import fs from "fs";

const INPUT_FILE = "av.js";

type OperationType = "reverse" | "splice" | "swap" | "unknown";

interface Step {
  arg: number;
  type: OperationType;
}

function extractDecipher(): void {
  console.log(`[+] Dang doc file ${INPUT_FILE}...`);
  let code: string;

  try {
    code = fs.readFileSync(INPUT_FILE, "utf-8");
  } catch {
    console.error(`Khong tim thay file '${INPUT_FILE}'.`);
    return;
  }

  const hMatch = code.match(/var h\s*=\s*"(.+?)"\.split\("\{"\)/);
  if (!hMatch?.[1]) {
    console.error("Khong tim thay mang h.");
    return;
  }

  const h = hMatch[1].split("{");
  const reverseIdx = h.indexOf("reverse");
  const spliceIdx = h.indexOf("splice");
  const sliceIdx = h.indexOf("slice");

  const helperCallRegex = /([a-zA-Z0-9_$]+)\[h\[(\d+)\]\]\([a-zA-Z0-9_$]+,\d+\)/g;
  const potentialHelpers: Record<string, number> = {};
  let helperMatch: RegExpExecArray | null;

  while ((helperMatch = helperCallRegex.exec(code)) !== null) {
    const objectName = helperMatch[1];
    potentialHelpers[objectName] = (potentialHelpers[objectName] || 0) + 1;
  }

  const helperName =
    Object.keys(potentialHelpers).length > 0
      ? Object.keys(potentialHelpers).reduce((best, current) =>
          (potentialHelpers[best] || 0) > (potentialHelpers[current] || 0) ? best : current
        )
      : null;

  if (!helperName) {
    console.error("Khong tim thay helper object.");
    return;
  }

  const escapeRegex = (value: string): string => value.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  const objectDefinitionRegex = new RegExp(
    `(?:var\\s+)?${escapeRegex(helperName)}\\s*=\\s*\\{([\\s\\S]*?)\\};`
  );
  const objectDefinitionMatch = code.match(objectDefinitionRegex);
  if (!objectDefinitionMatch?.index) {
    console.error(`Khong lay duoc noi dung object '${helperName}'.`);
    return;
  }

  const definitionStartIndex = objectDefinitionMatch.index + objectDefinitionMatch[0].indexOf("{");
  let braceCount = 0;
  let definitionEndIndex = 0;
  for (let index = definitionStartIndex; index < code.length; index++) {
    if (code[index] === "{") braceCount++;
    if (code[index] === "}") braceCount--;
    if (braceCount === 0) {
      definitionEndIndex = index + 1;
      break;
    }
  }

  const helperCode = code.substring(definitionStartIndex, definitionEndIndex);
  const operations: Record<number, OperationType> = {};
  const methodRegex = /([a-zA-Z0-9_$]+):function\((.*?)\)\{(.*?)\}/g;
  let methodMatch: RegExpExecArray | null;

  while ((methodMatch = methodRegex.exec(helperCode)) !== null) {
    const key = methodMatch[1];
    const body = methodMatch[3] || "";
    const hIndex = h.indexOf(key);

    let type: OperationType = "unknown";
    if (body.includes("reverse")) type = "reverse";
    else if (body.includes("splice")) type = "splice";
    else if (body.includes("var") && body.includes("[0]")) type = "swap";

    if (type === "unknown") {
      if (reverseIdx > -1 && body.includes(`h[${reverseIdx}]`)) type = "reverse";
      else if (spliceIdx > -1 && body.includes(`h[${spliceIdx}]`)) type = "splice";
      else if (sliceIdx > -1 && body.includes(`h[${sliceIdx}]`)) type = "splice";
    }

    if (hIndex !== -1) {
      operations[hIndex] = type;
    }
  }

  const steps: Step[] = [];
  const sequenceRegex = new RegExp(`${escapeRegex(helperName)}\\[h\\[(\\d+)\\]\\]\\([^,]+,(\\d+)\\)`, "g");
  let sequenceMatch: RegExpExecArray | null;

  while ((sequenceMatch = sequenceRegex.exec(code)) !== null) {
    const hIndex = Number.parseInt(sequenceMatch[1] || "0", 10);
    const arg = Number.parseInt(sequenceMatch[2] || "0", 10);
    const type = operations[hIndex];
    if (type) {
      steps.push({ type, arg });
    }
  }

  const finalSteps = steps.slice(0, 3);
  if (finalSteps.length === 0) {
    console.error("Khong trich xuat duoc logic.");
    return;
  }

  let generatedCode = 'function decipherSignature(sig) {\n    let a = sig.split("");\n\n';
  for (const step of finalSteps) {
    if (step.type === "reverse") {
      generatedCode += "    a.reverse();\n";
    } else if (step.type === "swap") {
      generatedCode +=
        `    const c = a[0];\n` +
        `    a[0] = a[${step.arg} % a.length];\n` +
        `    a[${step.arg} % a.length] = c;\n`;
    } else if (step.type === "splice") {
      generatedCode += `    a.splice(0, ${step.arg});\n`;
    }
  }

  generatedCode += '\n    return a.join("");\n}\n';
  console.log(generatedCode);
}

extractDecipher();
