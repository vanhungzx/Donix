const COLORS = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    cyan: "\x1b[96m",       
    yellow: "\x1b[93m",    
    green: "\x1b[92m",     
    red: "\x1b[91m",       
    gray: "\x1b[90m",
    magenta: "\x1b[95m",   
    white: "\x1b[97m"
};

type LogLevel = "info" | "warn" | "error" | "success" | "system";

const MAX_LOG_LENGTH = 500;

function hexToRgb(hex: string): [number, number, number] {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) {
        throw new Error(`Invalid hex color: ${hex}`);
    }
    return [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16)
    ];
}

function interpolateColor(
    color1: [number, number, number],
    color2: [number, number, number],
    factor: number
): [number, number, number] {
    return [
        Math.round(color1[0] + (color2[0] - color1[0]) * factor),
        Math.round(color1[1] + (color2[1] - color1[1]) * factor),
        Math.round(color1[2] + (color2[2] - color1[2]) * factor)
    ];
}

function rgbToAnsi(r: number, g: number, b: number, bold: boolean = true): string {
    const boldCode = bold ? COLORS.bold : '';
    return `${boldCode}\x1b[38;2;${r};${g};${b}m`;
}

function createGradient(...colors: string[]): (text: string) => string {
    if (colors.length === 0) {
        throw new Error("Cần ít nhất một màu để tạo gradient");
    }

    if (colors.length === 1) {
        
        const [r, g, b] = hexToRgb(colors[0]);
        const ansiColor = rgbToAnsi(r, g, b, true);
        return (text: string) => {
            return text.split('').map(char => {
                if (char === ' ') return char;
                return `${ansiColor}${char}${COLORS.reset}`;
            }).join('');
        };
    }

    const rgbColors = colors.map(hexToRgb);

    return (text: string) => {
        if (!text || text.length === 0) return text;

        const chars = text.split('');
        const nonSpaceIndices: number[] = [];
        chars.forEach((char, idx) => {
            if (char !== ' ') nonSpaceIndices.push(idx);
        });

        if (nonSpaceIndices.length === 0) return text;

        return chars.map((char, idx) => {
            if (char === ' ') return char;

            const position = nonSpaceIndices.indexOf(idx) / (nonSpaceIndices.length - 1 || 1);

            const segmentSize = 1 / (rgbColors.length - 1);
            const segmentIndex = Math.min(
                Math.floor(position / segmentSize),
                rgbColors.length - 2
            );

            const segmentStart = segmentIndex * segmentSize;
            const segmentFactor = (position - segmentStart) / segmentSize;

            const color1 = rgbColors[segmentIndex];
            const color2 = rgbColors[segmentIndex + 1];
            const [r, g, b] = interpolateColor(color1, color2, segmentFactor);

            return `${rgbToAnsi(r, g, b, true)}${char}${COLORS.reset}`;
        }).join('');
    };
}

function getTimestamp(): string {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

const GRADIENT_PRESETS = {
    info: createGradient("#00d4ff", "#0099ff", "#0066ff", "#0033ff", "#0000ff"),
    warn: createGradient("#ffeb3b", "#ffc107", "#ff9800", "#ff6f00", "#ff5722"),
    error: createGradient("#ff1744", "#ff0000", "#d50000", "#c51162", "#b71c1c"),
    success: createGradient("#00ff88", "#00e676", "#00c853", "#00aa44", "#00a152"),
    system: createGradient("#00d4ff", "#00b8d4", "#0097a7", "#00838f", "#006064")
};

function truncateLog(msg: string): string {
    if (msg.length <= MAX_LOG_LENGTH) return msg;
    return msg.substring(0, MAX_LOG_LENGTH) + "... [truncated]";
}

function log(msg: string, level: LogLevel = "info"): void {
    
    const truncatedMsg = truncateLog(msg);
    let label: string;
    let labelGradient: (text: string) => string;
    let timestampGradient: (text: string) => string;
    let bracketGradient: (text: string) => string;

    switch (level) {
        case "warn":
            label = "WARN";
            labelGradient = GRADIENT_PRESETS.warn;
            timestampGradient = createGradient("#ffb74d", "#ff9800", "#f57c00");
            bracketGradient = createGradient("#ff6b9d", "#ff8c42", "#ff6b35", "#c44569");
            break;
        case "error":
            label = "ERROR";
            labelGradient = GRADIENT_PRESETS.error;
            timestampGradient = createGradient("#ff5252", "#ff1744", "#d50000");
            bracketGradient = createGradient("#ff4757", "#ff1744", "#d50000", "#c51162");
            break;
        case "success":
            label = "SUCCESS";
            labelGradient = GRADIENT_PRESETS.success;
            timestampGradient = createGradient("#69f0ae", "#00e676", "#00c853");
            bracketGradient = createGradient("#2ed573", "#00e676", "#00c853", "#00aa44");
            break;
        case "system":
            label = "SYSTEM";
            labelGradient = GRADIENT_PRESETS.system;
            timestampGradient = createGradient("#4dd0e1", "#00bcd4", "#0097a7");
            bracketGradient = createGradient("#00d4ff", "#00b8d4", "#0097a7", "#00838f");
            break;
        default:
            label = "INFO";
            labelGradient = GRADIENT_PRESETS.info;
            timestampGradient = createGradient("#74b9ff", "#0984e3", "#6c5ce7");
            bracketGradient = createGradient("#5f27cd", "#4834d4", "#686de0", "#341f97");
    }

    const timestamp = getTimestamp();
    const gradientTimestamp = timestampGradient(timestamp);
    const leftBracket = bracketGradient("[");
    const rightBracket = bracketGradient("]");

    const gradientLabel = labelGradient(label);

    console.log(
        `${leftBracket}${gradientTimestamp}${rightBracket}${COLORS.reset} ${gradientLabel}${COLORS.reset} ${truncatedMsg}`
    );
}

function startBanner(text: string = "DONIX"): void {
    const bannerLines = [
        "██████╗░░█████╗░░█████╗░███╗░░░███╗██╗███████╗",
        "██╔══██╗██╔══██╗██╔══██╗████╗░████║██║██╔════╝",
        "██████╔╝██║░░██║██║░░██║██╔████╔██║██║█████╗░░",
        "██╔══██╗██║░░██║██║░░██║██║╚██╔╝██║██║██╔══╝░░",
        "██║░░██║╚█████╔╝╚█████╔╝██║░╚═╝░██║██║███████╗"
    ];
    const width = process.stdout.columns || 80;

    const bannerGradient = createGradient("#5f27cd", "#4834d4", "#00d2ff", "#0984e3", "#341f97", "#2d3436");

    const coloredLines = bannerLines.map(line => {
        const pad = Math.floor((width - line.length) / 2);
        const paddedLine = " ".repeat(Math.max(0, pad)) + line;
        return bannerGradient(paddedLine);
    });

    const textGradient = createGradient("#00d2ff", "#0984e3", "#6c5ce7", "#5f27cd", "#4834d4");
    const textLine = text;
    const textPad = Math.floor((width - textLine.length) / 2);
    const coloredText = " ".repeat(Math.max(0, textPad)) + textGradient(textLine);

    const smallGradient = createGradient("#a4b0be", "#90a4ae", "#78909c", "#607d8b", "#546e7a");
    const smallText = "Create by DongDev";
    const smallPad = Math.floor((width - smallText.length) / 2);
    const coloredSmallText = " ".repeat(Math.max(0, smallPad)) + smallGradient(smallText);

    console.log("\n" + coloredLines.join("\n") + "\n" + coloredText + "\n" + coloredSmallText + "\n");
}

export const gradient = createGradient;

export default {
    info: (msg: string) => log(msg, "info"),
    warn: (msg: string) => log(msg, "warn"),
    error: (msg: string) => log(msg, "error"),
    success: (msg: string) => log(msg, "success"),
    system: (msg: string) => log(msg, "system"),
    start: startBanner
};
