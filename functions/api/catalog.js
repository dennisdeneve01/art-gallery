import handler from "../../api/catalog.js";
import { run } from "../../cf/adapter.mjs";

export const onRequest = run(handler);
