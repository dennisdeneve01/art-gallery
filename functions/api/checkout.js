import handler from "../../api/checkout.js";
import { run } from "../../cf/adapter.mjs";

export const onRequest = run(handler);
