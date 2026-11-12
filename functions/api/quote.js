import handler from "../../api/quote.js";
import { run } from "../../cf/adapter.mjs";

export const onRequest = run(handler);
