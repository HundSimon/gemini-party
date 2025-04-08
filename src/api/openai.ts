import {Hono} from 'hono';
import {streamSSE} from 'hono/streaming';
import OpenAI from 'openai';
import type {ChatCompletionCreateParams, EmbeddingCreateParams} from 'openai/resources';

import {getApiKey} from '../utils/apikey';
import { createHonoErrorResponse, createErrorResponse } from '../utils/error';
import {openaiAuthMiddleware} from '../utils/middleware'

const oai = new Hono();

oai.use('/*', openaiAuthMiddleware);

const baseURL = "https://generativelanguage.googleapis.com/v1beta/openai/";

// OpenAI工厂
function getOpenAIClient(model: string | undefined = undefined) {
    return new OpenAI({
        apiKey: getApiKey(model), baseURL: baseURL
    });
}

// 创建聊天
oai.post('/chat/completions', async (c) => {
    const {messages, model, tools, tool_choice, stream = false} = await c.req.json() as ChatCompletionCreateParams & {
        stream?: boolean
    };
    const openai = getOpenAIClient(model); // 传入模型参数

    try {
        // 处理流式响应
        if (stream) {
            // 创建流式请求
            const completion = await openai.chat.completions.create({
                model: model, messages: messages, tools: tools, tool_choice: tool_choice, stream: true,
            });

            // 使用 Hono 的 streamSSE 进行流式处理
            return streamSSE(c, async (stream) => {
                try {
                    for await (const chunk of completion) {
                        await stream.writeSSE({
                            data: JSON.stringify(chunk)
                        });
                    }
                    await stream.writeSSE({data: '[DONE]'});
                } catch (error) {
                    console.error('流式处理错误:', error);
                    const { body } = createErrorResponse(error);
                    await stream.writeSSE({
                        data: JSON.stringify(body)
                    });
                }
            });
        }

        // 非流式响应
        const response = await openai.chat.completions.create({
            model: model, messages: messages, tools: tools, tool_choice: tool_choice,
        });

        return c.json(response);
    } catch (error: any) {
        console.error('API调用错误:', error);
        return createHonoErrorResponse(c, error);
    }
})

// 列出模型
oai.get('/models', async (c) => {
    const openai = getOpenAIClient();

    try {
        const models = await openai.models.list();
        return c.json({
            object: "list", data: models.data
        });
    } catch (error: any) {
        console.error('获取模型错误:', error);
        return createHonoErrorResponse(c, error);
    }
})

// 检索模型
oai.get('/models/:model', async (c) => {
    const {model: modelId} = c.req.param();
    const openai = getOpenAIClient();

    try {
        const model = await openai.models.retrieve(modelId);
        return c.json(model);
    } catch (error: any) {
        console.error('检索模型错误:', error);
        return createHonoErrorResponse(c, error);
    }
})

// Embeddings
oai.post('/embeddings', async (c) => {
    const {model, input, encoding_format, dimensions} = await c.req.json() as EmbeddingCreateParams;

    if (!model || !input) {
        return createHonoErrorResponse(c, {
            message: "请求体必须包含 'model' 和 'input' 参数。", type: "invalid_request_error", status: 400
        });
    }

    const openai = getOpenAIClient(model); // 传入模型参数

    try {
        const embeddingResponse = await openai.embeddings.create({
            model: model,
            input: input, ...(encoding_format && {encoding_format: encoding_format}), ...(dimensions && {dimensions: dimensions})
        });

        return c.json(embeddingResponse);
    } catch (error: any) {
        console.error('创建 Embeddings 时出错:', error);
        return createHonoErrorResponse(c, error);
    }
});

export default oai;