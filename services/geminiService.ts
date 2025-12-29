
import { GoogleGenAI } from "@google/genai";
import { InventoryItem } from "../types";

export const getInventoryInsights = async (items: InventoryItem[]): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const lowStock = items.filter(i => i.quantity <= i.minStock);
  
  const prompt = `
    這是一個工安耗材管理系統。
    當前庫存清單: ${JSON.stringify(items.map(i => ({ name: i.name, qty: i.quantity, min: i.minStock })))}
    庫存不足的項目: ${JSON.stringify(lowStock.map(i => i.name))}
    
    請以專業工安管理員的身份，提供 3 點具體的採購或管理建議。請用繁體中文回答，語氣要簡潔專業。
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text || "無法獲取建議";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "AI 助理暫時無法提供建議，請檢查您的庫存警示。";
  }
};
