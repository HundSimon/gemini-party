import type { GenerateContentParameters } from '@google/genai';
import { Hono } from 'hono';
import { GoogleGenAI } from "@google/genai";
import getGeminiAPIKey from './getGeminiAPIKey';
import createErrorResponse from './error';
import checkAuth from './auth';

const genai = new Hono();

// 打印请求信息
async function printLog(c: any) {
    console.log(await c.req.header());
    console.log(await c.req.json());
}

// 处理非流式内容生成
async function handleGenerateContent(ai: GoogleGenAI, modelName: string, body: any) {
    const response = await ai.models.generateContent({
        model: modelName,
        ...body  // 展开所有请求参数
    });
    return response;
}

// 处理流式内容生成
async function handleStreamGenerateContent(ai: GoogleGenAI, modelName: string, body: any, isGoogleClient: boolean) {
    const result = await ai.models.generateContentStream({
        model: modelName,
        ...body  // 展开所有请求参数
    });

    // 使用Response对象作为流式响应
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            try {
                for await (const chunk of result) {
                    // 将每个块转换为SSE格式
                    const data = JSON.stringify(chunk);
                    controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                }
                // 非Google客户端，添加结束标记
                if (!isGoogleClient) {
                    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                }
                controller.close();
            } catch (e) {
                controller.error(e);
            }
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        }
    });
}

genai.post('/models/:fullPath', async (c) => {
    const fullPath = c.req.param('fullPath');
    const [modelName, contentType] = fullPath.split(':');
    const apiKey = c.req.header('x-goog-api-key') || c.req.query('key');
    if (!checkAuth(apiKey)) return c.json({ error: 'Invalid API key' }, 401);

    const client = c.req.header('x-goog-api-client') || '';
    const isGoogleClient = client.includes('genai-js');

    // printLog(c);

    try {
        const ai = new GoogleGenAI({ apiKey: getGeminiAPIKey() });
        const body = await c.req.json();
        if (!modelName || !contentType) {
            return c.json({ error: 'Invalid path format' }, 400);
        }

        // 根据内容类型调用对应的处理函数
        if (contentType === 'generateContent') {
            const response = await handleGenerateContent(ai, modelName, body);
            return c.json(response);
        }

        if (contentType === 'streamGenerateContent') {
            return await handleStreamGenerateContent(ai, modelName, body, isGoogleClient);
        }

        return c.json({ error: `Unsupported content type: ${contentType}` }, 400);

    } catch (error: any) {
        console.error('API调用错误:', error);
        const { status, body } = createErrorResponse(error);
        return c.json(body, status);
    }
});

export default genai;