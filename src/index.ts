import {Hono} from "hono";

import genai from "./api/gemini";
import oai from "./api/openai";
import {getRotationStatus} from "./utils/apikey";
import createErrorResponse from "./utils/error";
import validateHarmCategories from "./utils/safety";

const app = new Hono();

// 启动时检测设置
validateHarmCategories();

// API 前缀
const API_PREFIX: string = process.env.API_PREFIX ?? "";

app.route(API_PREFIX + "/v1", oai);
app.route(API_PREFIX + "/v1beta", genai);

app.get("/info", async (c) => {
    try {
        const status = getRotationStatus();
        return c.json({
            status: "success", data: status,
        });
    } catch (error: any) {
        console.error("获取轮训状态错误:", error);
        const {status, body} = createErrorResponse(error);
        return c.json(body, status);
    }
});

// 导出为 Bun 兼容格式
export default app;