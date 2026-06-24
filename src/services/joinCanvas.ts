import { createCanvas, loadImage, Canvas, CanvasRenderingContext2D } from "canvas";
import * as fs from "fs";

interface CyberpunkContentConfig {
  welcomeText?: string;
  memberName?: string;
  groupName?: string;
  memberNumber?: number;
  joinTime?: string;
}

interface GenerateOptions {
  avatarPath?: string | null;
  outputPath?: string;
  contentConfig?: CyberpunkContentConfig;
  dataValues?: number[];
  width?: number;
  height?: number;
}

interface GenerateResult {
  success: boolean;
  outputPath: string;
  buffer: Buffer;
}

class CyberpunkInterface {
  width: number;
  height: number;
  canvas: Canvas;
  ctx: CanvasRenderingContext2D;

  colors = {
    darkBlue: "#0a1628",
    cyan: "#00ffff",
    brightCyan: "#00d9ff",
    white: "#ffffff",
  };

  constructor(width = 900, height = 400) {
    this.width = width;
    this.height = height;
    this.canvas = createCanvas(width, height);
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Cannot get 2D context from canvas");
    this.ctx = ctx;
  }

  private drawMatrixBackground() {
    const { ctx, width, height } = this;
    const { darkBlue } = this.colors;

    ctx.fillStyle = darkBlue;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "rgba(0, 100, 150, 0.15)";
    for (let y = 0; y < height; y += 4) {
      ctx.fillRect(0, y, width, 2);
    }

    ctx.fillStyle = "rgba(0, 150, 200, 0.08)";
    for (let x = 0; x < width; x += 6) {
      ctx.fillRect(x, 0, 1, height);
    }

    ctx.fillStyle = "rgba(0, 255, 255, 0.05)";
    ctx.font = "10px monospace";
    for (let i = 0; i < 50; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const binary = Math.random() > 0.5 ? "1" : "0";
      ctx.fillText(binary, x, y);
    }

    this.drawGridLines();
    this.drawCircuitPatterns();
  }

  private drawGridLines() {
    const { ctx, width, height } = this;

    ctx.strokeStyle = "rgba(0, 255, 255, 0.1)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 20; i++) {
      const y = (i * height) / 20;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(0, 100, 150, 0.1)";
    ctx.lineWidth = 0.5;
    for (let x = 0; x < width; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    for (let y = 0; y < height; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }

  private drawCircuitPatterns() {
    const { ctx, width, height, colors } = this;

    ctx.save();
    ctx.strokeStyle = "rgba(0, 255, 255, 0.3)";
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(50, 50);
    ctx.lineTo(150, 50);
    ctx.lineTo(150, 100);
    ctx.lineTo(120, 100);
    ctx.stroke();

    ctx.fillStyle = colors.cyan;
    ctx.beginPath();
    ctx.arc(150, 50, 3, 0, 2 * Math.PI);
    ctx.fill();

    ctx.strokeStyle = "rgba(0, 255, 255, 0.3)";
    ctx.beginPath();
    ctx.moveTo(width - 150, height - 50);
    ctx.lineTo(width - 50, height - 50);
    ctx.lineTo(width - 50, height - 100);
    ctx.lineTo(width - 80, height - 100);
    ctx.stroke();

    ctx.fillStyle = colors.cyan;
    ctx.beginPath();
    ctx.arc(width - 50, height - 50, 3, 0, 2 * Math.PI);
    ctx.fill();

    this.drawHexagonPattern(width - 200, 100, 30);
    ctx.restore();
  }

  private drawHexagonPattern(centerX: number, centerY: number, size: number) {
    const { ctx } = this;

    ctx.save();
    ctx.strokeStyle = "rgba(0, 255, 255, 0.2)";
    ctx.lineWidth = 1;

    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const x = centerX + (i - 1) * size * 1.5;
        const y = centerY + ((j - 1) * size * Math.sqrt(3)) / 2;

        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const angle = (k * Math.PI) / 3;
          const px = x + size * 0.3 * Math.cos(angle);
          const py = y + size * 0.3 * Math.sin(angle);
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawCornerBrackets() {
    const { ctx, width, height, colors } = this;

    ctx.save();
    ctx.shadowColor = colors.cyan;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = colors.cyan;
    ctx.lineWidth = 3;

    const cornerSize = 30;
    const margin = 20;

    ctx.beginPath();
    ctx.moveTo(margin, margin + cornerSize);
    ctx.lineTo(margin, margin);
    ctx.lineTo(margin + cornerSize, margin);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(width - margin - cornerSize, margin);
    ctx.lineTo(width - margin, margin);
    ctx.lineTo(width - margin, margin + cornerSize);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(margin, height - margin - cornerSize);
    ctx.lineTo(margin, height - margin);
    ctx.lineTo(margin + cornerSize, height - margin);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(width - margin - cornerSize, height - margin);
    ctx.lineTo(width - margin, height - margin);
    ctx.lineTo(width - margin, height - margin - cornerSize);
    ctx.stroke();

    ctx.restore();
  }

  private async drawAvatar(avatarSource: string | null = null) {
    const { ctx, colors } = this;
    const avatarX = 120;
    const avatarY = 200;
    const avatarRadius = 80;

    ctx.save();

    const extraOuterGlow = ctx.createRadialGradient(
      avatarX,
      avatarY,
      0,
      avatarX,
      avatarY,
      avatarRadius + 22
    );
    extraOuterGlow.addColorStop(0, "rgba(0, 255, 255, 0.25)");
    extraOuterGlow.addColorStop(0.5, "rgba(0, 255, 255, 0.12)");
    extraOuterGlow.addColorStop(1, "rgba(0, 255, 255, 0)");
    ctx.fillStyle = extraOuterGlow;
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius + 22, 0, 2 * Math.PI);
    ctx.fill();

    const outerGlow = ctx.createRadialGradient(
      avatarX,
      avatarY,
      0,
      avatarX,
      avatarY,
      avatarRadius + 12
    );
    outerGlow.addColorStop(0, "rgba(0, 255, 255, 0.4)");
    outerGlow.addColorStop(0.5, "rgba(0, 255, 255, 0.2)");
    outerGlow.addColorStop(1, "rgba(0, 255, 255, 0)");
    ctx.fillStyle = outerGlow;
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius + 12, 0, 2 * Math.PI);
    ctx.fill();

    const middleGlow = ctx.createRadialGradient(
      avatarX,
      avatarY,
      0,
      avatarX,
      avatarY,
      avatarRadius + 7
    );
    middleGlow.addColorStop(0, "rgba(0, 255, 255, 0.6)");
    middleGlow.addColorStop(0.7, "rgba(0, 255, 255, 0.3)");
    middleGlow.addColorStop(1, "rgba(0, 255, 255, 0)");
    ctx.fillStyle = middleGlow;
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius + 7, 0, 2 * Math.PI);
    ctx.fill();

    const innerGlow = ctx.createRadialGradient(
      avatarX,
      avatarY,
      avatarRadius - 5,
      avatarX,
      avatarY,
      avatarRadius + 3
    );
    innerGlow.addColorStop(0, "rgba(0, 255, 255, 0.8)");
    innerGlow.addColorStop(1, "rgba(0, 255, 255, 0)");
    ctx.fillStyle = innerGlow;
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius + 3, 0, 2 * Math.PI);
    ctx.fill();

    ctx.shadowColor = colors.cyan;
    ctx.shadowBlur = 8;
    ctx.strokeStyle = colors.cyan;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius, 0, 2 * Math.PI);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius - 3, 0, 2 * Math.PI);
    ctx.clip();

    if (avatarSource) {
      try {
        let imageUrl = avatarSource;

        if (
          !avatarSource.startsWith("http") &&
          !avatarSource.startsWith("./") &&
          !avatarSource.startsWith("/")
        ) {
          imageUrl = `https://graph.facebook.com/${avatarSource}/picture?width=512&height=512&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`;
        }

        const avatarImage = await loadImage(imageUrl);
        const size = avatarRadius * 2 - 6;
        ctx.drawImage(
          avatarImage,
          avatarX - avatarRadius + 3,
          avatarY - avatarRadius + 3,
          size,
          size
        );
      } catch (error) {
        console.log(
          "Could not load avatar image, using default silhouette"
        );
      }
    }

    ctx.restore();
  }

  private drawMainContent(config: CyberpunkContentConfig = {}) {
    const { ctx, width, colors } = this;
    const {
      welcomeText = ">>> CHÀO MỪNG VÀO NHÓM <<<",
      memberName = "Minh Đồng",
      groupName = "Nhóm Test",
      memberNumber = 20,
      joinTime = "31/07/2025 - 18:01:02",
    } = config;

    ctx.save();
    ctx.shadowColor = colors.cyan;
    ctx.shadowBlur = 20;
    ctx.fillStyle = colors.cyan;
    ctx.font = "bold 26px monospace";
    ctx.textAlign = "center";
    ctx.fillText(welcomeText, width / 2, 70);

    ctx.shadowBlur = 8;
    ctx.fillStyle = colors.white;
    ctx.fillText(welcomeText, width / 2, 70);
    ctx.restore();

    ctx.textAlign = "left";
    const textStartX = 240;

    ctx.save();
    ctx.shadowColor = colors.white;
    ctx.shadowBlur = 10;
    ctx.fillStyle = colors.white;
    ctx.font = "bold 20px monospace";
    ctx.fillText("THÀNH VIÊN MỚI", textStartX, 120);
    ctx.restore();

    ctx.save();
    ctx.shadowColor = colors.brightCyan;
    ctx.shadowBlur = 8;
    ctx.fillStyle = colors.brightCyan;
    ctx.font = "bold 18px monospace";
    ctx.fillText(`Tên: ${memberName}`, textStartX, 145);
    ctx.restore();

    ctx.save();
    ctx.shadowColor = colors.white;
    ctx.shadowBlur = 5;
    ctx.fillStyle = colors.white;
    ctx.font = "bold 16px monospace";
    ctx.fillText(groupName, textStartX, 170);
    ctx.fillText(`Thành viên thứ ${memberNumber}`, textStartX, 190);
    ctx.fillText(`Vào lúc ${joinTime}`, textStartX, 210);
    ctx.restore();
  }

  private drawProgressBar() {
    const { ctx, colors } = this;
    const barX = 240;
    const barY = 250;
    const barWidth = 400;
    const barHeight = 12;

    ctx.save();
    ctx.fillStyle = "#1a2332";
    ctx.fillRect(barX, barY, barWidth, barHeight);

    ctx.strokeStyle = "rgba(0, 255, 255, 0.4)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(barX - 20, barY);
    ctx.lineTo(barX - 5, barY);
    ctx.lineTo(barX - 5, barY + barHeight);
    ctx.lineTo(barX - 20, barY + barHeight);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(barX + barWidth + 5, barY);
    ctx.lineTo(barX + barWidth + 20, barY);
    ctx.lineTo(barX + barWidth + 20, barY + barHeight);
    ctx.lineTo(barX + barWidth + 5, barY + barHeight);
    ctx.stroke();

    ctx.shadowColor = colors.cyan;
    ctx.shadowBlur = 15;
    ctx.strokeStyle = colors.cyan;
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barWidth, barHeight);

    const progressGradient = ctx.createLinearGradient(
      barX,
      barY,
      barX + barWidth,
      barY
    );
    progressGradient.addColorStop(0, "#00ffff");
    progressGradient.addColorStop(0.3, "#00d9ff");
    progressGradient.addColorStop(0.6, "#88ffff");
    progressGradient.addColorStop(1, "#ffffff");
    ctx.fillStyle = progressGradient;
    ctx.fillRect(barX, barY, barWidth, barHeight);

    const pulseGradient = ctx.createLinearGradient(
      barX,
      barY,
      barX + barWidth,
      barY
    );
    pulseGradient.addColorStop(0, "rgba(255, 255, 255, 0.3)");
    pulseGradient.addColorStop(0.5, "rgba(255, 255, 255, 0.7)");
    pulseGradient.addColorStop(1, "rgba(255, 255, 255, 0.3)");
    ctx.fillStyle = pulseGradient;
    ctx.fillRect(barX, barY, barWidth, barHeight);
    ctx.restore();

    ctx.save();
    ctx.shadowColor = colors.brightCyan;
    ctx.shadowBlur = 8;
    ctx.fillStyle = colors.brightCyan;
    ctx.font = "bold 13px monospace";
    ctx.fillText("CONNECTION ESTABLISHED", barX, barY + 28);
    ctx.restore();
  }

  private drawDataBars(data: number[] = [0.6, 0.8, 0.4, 0.9, 0.7]) {
    const { ctx, width, height, colors } = this;
    const barWidth = 12;
    const barSpacing = 16;
    const maxBarHeight = 80;
    const startX = width - 120;
    const baseY = height - 60;

    ctx.save();
    for (let i = 0; i < data.length; i++) {
      const barHeight = data[i] * maxBarHeight;
      const x = startX + i * barSpacing;
      const y = baseY - barHeight;

      const gradient = ctx.createLinearGradient(0, baseY, 0, y);
      gradient.addColorStop(0, "rgba(0, 255, 255, 0.4)");
      gradient.addColorStop(0.5, "rgba(0, 255, 255, 0.8)");
      gradient.addColorStop(1, "#00ffff");

      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, barWidth, barHeight);

      ctx.shadowColor = colors.cyan;
      ctx.shadowBlur = 15;
      ctx.fillRect(x, y, barWidth, barHeight);

      ctx.shadowBlur = 0;
      ctx.fillStyle = colors.white;
      ctx.fillRect(x, y, barWidth, 2);
    }
    ctx.restore();
  }

  private addGlitchEffects() {
    const { ctx, width, height } = this;

    ctx.save();
    ctx.strokeStyle = "rgba(0, 255, 255, 0.15)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const y = Math.random() * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(0, 255, 255, 0.1)";
    for (let i = 0; i < 20; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.restore();
  }

  async generate(options: GenerateOptions = {}): Promise<GenerateResult> {
    const {
      avatarPath = null,
      outputPath = "cyberpunk_interface.png",
      contentConfig = {},
      dataValues = [0.6, 0.8, 0.4, 0.9, 0.7],
    } = options;

    this.drawMatrixBackground();
    this.drawCornerBrackets();
    await this.drawAvatar(avatarPath);
    this.drawMainContent(contentConfig);
    this.drawProgressBar();
    this.drawDataBars(dataValues);
    this.addGlitchEffects();

    const buffer = this.canvas.toBuffer("image/png");
    fs.writeFileSync(outputPath, buffer);

    return {
      success: true,
      outputPath,
      buffer,
    };
  }

  getCanvas(): Canvas {
    return this.canvas;
  }

  getBuffer(_format: "image/png" | "image/jpeg" | "image/webp" = "image/png") {
    return this.canvas.toBuffer((err: any, result: Buffer<ArrayBufferLike>) => {
      if (err) {
        throw err;
      }
      return result;
    });
  }
}

export async function joinCanvas(
  options: GenerateOptions = {}
): Promise<GenerateResult> {
  const ui = new CyberpunkInterface(options.width, options.height);
  return await ui.generate(options);
}

export { CyberpunkInterface, GenerateOptions, GenerateResult };
