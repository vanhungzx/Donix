import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";


export async function loadServices(): Promise<Record<string, unknown>> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const servicesDir = path.join(__dirname, "..", "services");
  const services: Record<string, unknown> = {};

  try {
    const files = fs.readdirSync(servicesDir, { withFileTypes: true });

    for (const file of files) {

      if (file.isDirectory() || !file.name.endsWith(".ts")) {
        continue;
      }

      const serviceName = file.name.replace(/\.ts$/, "");

      const importPath = `../services/${serviceName}.ts`;

      try {

        const module = await import(importPath);


        const service = module.default !== undefined ? module.default : module;


        if (service != null) {
          services[serviceName] = service;
        }
      } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        try {
          const importPathNoExt = `../services/${serviceName}`;
          const module = await import(importPathNoExt);
          const service = module.default !== undefined ? module.default : module;
          if (service != null) {
            services[serviceName] = service;
          }
        } catch (fallbackError: unknown) {
          console.warn(`Không thể load service ${serviceName}: ${err.message || String(error)}`);
        }
      }
    }
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.warn(`Không thể đọc thư mục services: ${err.message || String(error)}`);
  }

  return services;
}
