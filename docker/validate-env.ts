import { ZodError } from "zod";
import { parseEnv } from "../src/lib/env";

try {
  parseEnv();
  console.log("[all-in-one] environment validated");
} catch (error) {
  console.error("[all-in-one] invalid environment:");
  if (error instanceof ZodError) {
    for (const issue of error.issues) {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      console.error(` - ${path}: ${issue.message}`);
    }
  } else if (error instanceof Error) {
    console.error(` - ${error.message}`);
  } else {
    console.error(` - ${String(error)}`);
  }
  process.exit(1);
}
