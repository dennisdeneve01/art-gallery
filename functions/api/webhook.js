import handler from "../../api/webhook.js";
import { run } from "../../cf/adapter.mjs";

export const onRequest = run(handler);
