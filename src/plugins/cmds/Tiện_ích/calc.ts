"use strict";

import type { Command, CommandOnCallContext } from '@types';


function replaceVariable(expr: string, varName: string, value: number): string {
  
  const regex = new RegExp(`\\b${varName}\\b`, 'g');
  return expr.replace(regex, `(${value})`);
}


function numericalDerivative(expr: string, x: number, h: number = 1e-5): number {
  const mathEnv = createMathEnv();

  
  const expr1 = replaceVariable(expr, 'x', x + h);
  const expr2 = replaceVariable(expr, 'x', x - h);

  const f1 = evaluateExpression(expr1, mathEnv);
  const f2 = evaluateExpression(expr2, mathEnv);

  
  return (f1 - f2) / (2 * h);
}


function numericalIntegral(expr: string, a: number, b: number, n: number = 1000): number {
  const mathEnv = createMathEnv();
  const h = (b - a) / n;
  let sum = 0;

  for (let i = 0; i <= n; i++) {
    const x = a + i * h;
    const exprX = replaceVariable(expr, 'x', x);
    const fx = evaluateExpression(exprX, mathEnv);

    if (i === 0 || i === n) {
      sum += fx;
    } else if (i % 2 === 0) {
      sum += 2 * fx;
    } else {
      sum += 4 * fx;
    }
  }

  return (h / 3) * sum;
}


function createMathEnv(): Record<string, any> {
  return {
    
    pi: Math.PI,
    e: Math.E,
    PI: Math.PI,
    E: Math.E,

    
    sin: (x: number) => Math.sin(x),
    cos: (x: number) => Math.cos(x),
    tan: (x: number) => Math.tan(x),
    asin: (x: number) => Math.asin(x),
    acos: (x: number) => Math.acos(x),
    atan: (x: number) => Math.atan(x),
    atan2: (y: number, x: number) => Math.atan2(y, x),

    
    sinh: (x: number) => Math.sinh(x),
    cosh: (x: number) => Math.cosh(x),
    tanh: (x: number) => Math.tanh(x),

    
    pow: (x: number, y: number) => Math.pow(x, y),
    sqrt: (x: number) => Math.sqrt(x),
    cbrt: (x: number) => Math.cbrt(x),
    exp: (x: number) => Math.exp(x),

    
    log: (x: number) => Math.log(x),
    ln: (x: number) => Math.log(x),
    log10: (x: number) => Math.log10(x),
    log2: (x: number) => Math.log2(x),

    
    round: (x: number) => Math.round(x),
    floor: (x: number) => Math.floor(x),
    ceil: (x: number) => Math.ceil(x),
    abs: (x: number) => Math.abs(x),

    
    min: (...args: number[]) => Math.min(...args),
    max: (...args: number[]) => Math.max(...args),

    
    random: () => Math.random(),

    
    deg: (x: number) => x * Math.PI / 180,
    rad: (x: number) => x,

    
    sind: (x: number) => Math.sin(x * Math.PI / 180),
    cosd: (x: number) => Math.cos(x * Math.PI / 180),
    tand: (x: number) => Math.tan(x * Math.PI / 180),

    
    fact: (n: number) => {
      if (n < 0 || n !== Math.floor(n)) throw new Error("Giai thừa chỉ áp dụng cho số nguyên dương");
      let result = 1;
      for (let i = 2; i <= n; i++) result *= i;
      return result;
    },

    
    comb: (n: number, k: number) => {
      if (k > n || k < 0) return 0;
      k = Math.min(k, n - k);
      let result = 1;
      for (let i = 0; i < k; i++) {
        result = result * (n - i) / (i + 1);
      }
      return Math.round(result);
    },

    
    perm: (n: number, k: number) => {
      if (k > n || k < 0) return 0;
      let result = 1;
      for (let i = 0; i < k; i++) {
        result *= (n - i);
      }
      return result;
    },

    
    gcd: (...args: number[]) => {
      const gcd2 = (a: number, b: number): number => b === 0 ? a : gcd2(b, a % b);
      return args.reduce(gcd2);
    },
    lcm: (...args: number[]) => {
      const lcm2 = (a: number, b: number): number => Math.abs(a * b) / (() => {
        const gcd2 = (a: number, b: number): number => b === 0 ? a : gcd2(b, a % b);
        return gcd2(a, b);
      })();
      return args.reduce(lcm2);
    },
  };
}


function evaluateExpression(expression: string, mathEnv: Record<string, any>): number {
  let processedExpr = expression;

  
  const functions = [
    'atan2', 'log10', 'log2',
    'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'sind', 'cosd', 'tand',
    'sqrt', 'cbrt', 'exp',
    'sin', 'cos', 'tan', 'log', 'pow', 'min', 'max', 'deg', 'rad',
    'round', 'floor', 'ceil', 'abs', 'ln', 'random',
    'fact', 'comb', 'perm', 'gcd', 'lcm'
  ];

  for (const func of functions) {
    const regex = new RegExp(`\\b${func}\\s*\\(`, 'gi');
    processedExpr = processedExpr.replace(regex, `mathEnv.${func}(`);
  }

  processedExpr = processedExpr.replace(/\bpi\b/gi, 'mathEnv.pi');
  processedExpr = processedExpr.replace(/([+\-*/(,\s]|^)e([+\-*/),\s]|$)/gi, '$1mathEnv.e$2');

  const result = Function('mathEnv', `"use strict"; return (${processedExpr})`)(mathEnv);

  if (typeof result !== 'number' || !isFinite(result)) {
    throw new Error("Kết quả không hợp lệ");
  }

  return result;
}

function safeEval(expression: string): number {
  try {
    const mathEnv = createMathEnv();
    return evaluateExpression(expression, mathEnv);
  } catch (error: any) {
    throw new Error(`Lỗi tính toán: ${error.message || "Biểu thức không hợp lệ"}`);
  }
}

function formatNumber(num: number): string {
  
  const rounded = Math.round(num * 10000000000) / 10000000000;

  
  if (rounded % 1 === 0) {
    return rounded.toString();
  }

  
  return rounded.toFixed(10).replace(/\.?0+$/, '');
}

const calcCommand: Command = {
  name: "calc",
  alias: ["tinh", "calculator", "maytinh"],
  version: "3.0.0",
  role: 0,
  desc: "Máy tính toán học đầy đủ từ lớp 1-12: đạo hàm, tích phân, lượng giác, logarit",
  guide:
    "   {pn} <biểu thức>\n" +
    "   {pn} derivative <biểu thức> <x>\n" +
    "   {pn} integral <biểu thức> <a> <b>\n\n" +
    "   📐 Lượng giác: sin, cos, tan, asin, acos, atan\n" +
    "   📐 Lượng giác hyperbol: sinh, cosh, tanh\n" +
    "   📐 Lượng giác độ: sind, cosd, tand\n" +
    "   🔢 Lũy thừa: pow(x,y), sqrt(x), cbrt(x), exp(x)\n" +
    "   📊 Logarit: log(x), ln(x), log10(x), log2(x)\n" +
    "   🔄 Làm tròn: round(x), floor(x), ceil(x), abs(x)\n" +
    "   🔢 Tổ hợp: fact(n), comb(n,k), perm(n,k)\n" +
    "   🔢 GCD/LCM: gcd(...), lcm(...)\n" +
    "   📈 Khác: min(...), max(...), random()\n" +
    "   🔢 Hằng số: pi, e\n" +
    "   📊 Đạo hàm: derivative(\"x^2\", 2)\n" +
    "   📊 Tích phân: integral(\"x^2\", 0, 1)\n\n" +
    "   Ví dụ:\n" +
    "   • {pn} sin(pi/2)\n" +
    "   • {pn} pow(2, 10)\n" +
    "   • {pn} fact(5)\n" +
    "   • {pn} derivative x^2 2\n" +
    "   • {pn} integral x^2 0 1",
  cd: 2,
  prefix: true,
  async onCall(ctx: CommandOnCallContext): Promise<void> {
    const { args, reply } = ctx;

    try {
      if (!args[0]) {
        await reply({
          body: "❌ Vui lòng nhập biểu thức cần tính!\n" +
            "📖 Cách sử dụng:\n" +
            "• {pn} <biểu thức> - Tính toán thông thường\n" +
            "• {pn} derivative <biểu thức> <x> - Tính đạo hàm tại x\n" +
            "• {pn} integral <biểu thức> <a> <b> - Tính tích phân từ a đến b\n" +
            "📐 Lượng giác: sin, cos, tan, asin, acos, atan\n" +
            "🔢 Lũy thừa: pow(x,y), sqrt(x), cbrt(x), exp(x)\n" +
            "📊 Logarit: log(x), ln(x), log10(x), log2(x)\n" +
            "🔄 Làm tròn: round(x), floor(x), ceil(x), abs(x)\n" +
            "🔢 Tổ hợp: fact(n), comb(n,k), perm(n,k)\n" +
            "🔢 GCD/LCM: gcd(...), lcm(...)\n" +
            "🔢 Hằng số: pi, e\n" +
            "Ví dụ: {pn} sin(pi/2) | {pn} fact(5) | {pn} derivative x^2 2 | {pn} integral x^2 0 1"
        });
        return;
      }

      const firstArg = args[0].toLowerCase();
      let result: number;
      let resultType = "TÍNH TOÁN";
      let expression = args.join(" ").trim();

      
      if (firstArg === "derivative" || firstArg === "der" || firstArg === "đạo hàm") {
        if (args.length < 3) {
          await reply({
            body: "❌ Thiếu tham số! Cú pháp: {pn} derivative <biểu thức> <x>\nVí dụ: {pn} derivative x^2 2"
          });
          return;
        }

        const expr = args.slice(1, -1).join(" ").replace(/\^/g, "**");
        const x = parseFloat(args[args.length - 1]!);

        if (isNaN(x)) {
          await reply({
            body: "❌ Giá trị x không hợp lệ!"
          });
          return;
        }

        result = numericalDerivative(expr, x);
        resultType = "ĐẠO HÀM";
        expression = `f'(x) tại x=${x} của ${args.slice(1, -1).join(" ")}`;

      }
      
      else if (firstArg === "integral" || firstArg === "int" || firstArg === "tích phân") {
        if (args.length < 4) {
          await reply({
            body: "❌ Thiếu tham số! Cú pháp: {pn} integral <biểu thức> <a> <b>\nVí dụ: {pn} integral x^2 0 1"
          });
          return;
        }

        const expr = args.slice(1, -2).join(" ").replace(/\^/g, "**");
        const a = parseFloat(args[args.length - 2]!);
        const b = parseFloat(args[args.length - 1]!);

        if (isNaN(a) || isNaN(b)) {
          await reply({
            body: "❌ Giá trị a hoặc b không hợp lệ!"
          });
          return;
        }

        if (a >= b) {
          await reply({
            body: "❌ a phải nhỏ hơn b!"
          });
          return;
        }

        result = numericalIntegral(expr, a, b);
        resultType = "TÍCH PHÂN";
        expression = `∫[${a}→${b}] ${args.slice(1, -2).join(" ")} dx`;

      }
      
      else {
        if (expression.length > 300) {
          await reply({
            body: "❌ Biểu thức quá dài! Vui lòng nhập tối đa 300 ký tự."
          });
          return;
        }

        
        expression = expression.replace(/\^/g, "**");
        result = safeEval(expression);
      }

      const formattedResult = formatNumber(result);

      await reply({
        body: `🧮 KẾT QUẢ ${resultType}\n📝 Biểu thức: \`${expression}\`\n✨ Kết quả: **${formattedResult}**`
      });

    } catch (e: any) {
      console.error("Calc command error:", e);
      await reply({
        body: `❌ ${e.message || "Lỗi không xác định"}\n💡 Gợi ý: Kiểm tra lại biểu thức toán học của bạn.`
      });
    }
  },
};

export default calcCommand;
