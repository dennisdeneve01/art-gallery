import handler from "../../api/order.js";
import { run } from "../../cf/adapter.mjs";

export const onRequest = run(handler);
