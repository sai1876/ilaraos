import { parseIntent } from './intentParser';
import { getConversationState, updateConversationState } from './conversationMemory';
import { retrieveMenu } from './retriever';
import { rankMenuItems } from './menuRanker';
import { resolveOrderRequest } from './orderResolver';
import { stageOrderInDatabase } from './orderTool';
import { generateResponse } from './responseGenerator';
import { getDeterministicFallback } from './deterministicFallback';
import { ParsedIntent, ChatIntent } from './types';
import { MenuItem } from '@/lib/types';
import { adminDb } from '@/lib/firebaseAdmin';

function withTimeout<T>(promise: Promise<T>, ms: number, fallbackErrorMsg: string): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(fallbackErrorMsg));
    }, ms);
  });
  return Promise.race([
    promise.finally(() => clearTimeout(timeoutId)),
    timeoutPromise
  ]);
}

export const chatOrchestrator = {
  async processMessage(params: {
    messageText: string;
    phone: string;
    userId: string;
    userData?: any;
    baseUrl?: string;
  }): Promise<{ reply: string }> {
    const { messageText, phone, userId, baseUrl = 'https://ilaracafe.vercel.app' } = params;
    
    // 1. Get memory
    const state = await getConversationState(phone);

    // 2. Parse Intent (with timeout)
    let parsed: ParsedIntent;
    try {
      parsed = await withTimeout(
        parseIntent(messageText, state.turns),
        6000,
        'Intent parsing timeout'
      );
    } catch (error) {
      console.warn('[CHAT ORCHESTRATOR] AI Intent Parsing failed/timed out, falling back to deterministic heuristics:', error);
      
      const lower = messageText.toLowerCase();
      let fallbackIntent: ChatIntent = 'UNKNOWN';
      if (lower.includes('menu') || lower.includes('show')) fallbackIntent = 'MENU';
      else if (lower.includes('hi') || lower.includes('hello')) fallbackIntent = 'GREETING';
      
      const snap = await adminDb!.collection('menu').where('is_available', '==', true).get();
      const menuItems = snap.docs.map(d => d.data() as MenuItem);
      
      const matchedItems = [];
      for (const item of menuItems) {
        if (lower.includes(item.name.toLowerCase().trim())) {
          matchedItems.push({ item, quantity: 1 });
        }
      }
      
      let checkoutLink = '';
      let orderSummary = '';
      if (matchedItems.length > 0) {
        fallbackIntent = 'ORDER';
        const orderId = await stageOrderInDatabase(phone, userId, matchedItems);
        checkoutLink = `${baseUrl}/cart?session=${orderId}&magic=true`;
        orderSummary = matchedItems.map(m => `${m.quantity}x ${m.item.name}`).join(', ');
      }
      
      return { reply: getDeterministicFallback(fallbackIntent, messageText, checkoutLink, orderSummary, [], menuItems.slice(0,3)) };
    }

    // 3. Handle Intent
    let retrievedItems: MenuItem[] = [];
    let ambiguousItems: MenuItem[] = [];
    let checkoutLink = '';
    let orderSummary = '';
    const recentItemIds = [...state.recent_item_ids];

    if (parsed.intent === 'ORDER' || parsed.intent === 'RECOMMEND' || parsed.intent === 'MENU') {
      const snap = await adminDb!.collection('menu').where('is_available', '==', true).get();
      const allActiveMenuItems = snap.docs.map(d => d.data() as MenuItem);

      if (parsed.intent === 'ORDER' && parsed.items && parsed.items.length > 0) {
        const orderCandidates = [];
        for (const reqItem of parsed.items) {
          let textToResolve = reqItem.requestedName;
          const isContextual = /^(that|this|those|it|one|same|order)$/i.test(textToResolve.trim());
          if (isContextual && recentItemIds.length > 0) {
             const recent = allActiveMenuItems.find(m => m.item_id === recentItemIds[0]);
             if (recent) textToResolve = recent.name;
          }
          
          const result = resolveOrderRequest(textToResolve, reqItem.quantity, allActiveMenuItems);
          if (result.status === 'exact' && result.resolvedItems) {
            orderCandidates.push(...result.resolvedItems);
          } else if (result.status === 'ambiguous' && result.ambiguousCandidates) {
            ambiguousItems.push(...result.ambiguousCandidates);
          }
        }

        if (ambiguousItems.length === 0 && orderCandidates.length > 0) {
          const orderId = await stageOrderInDatabase(phone, userId, orderCandidates);
          checkoutLink = `${baseUrl}/cart?session=${orderId}&magic=true`;
          orderSummary = orderCandidates.map(m => `${m.quantity}x ${m.item.name}`).join(', ');
          
          for (const cand of orderCandidates) {
            if (!recentItemIds.includes(cand.item.item_id)) {
              recentItemIds.unshift(cand.item.item_id);
            }
          }
        }
      } else if (parsed.intent === 'RECOMMEND' || parsed.intent === 'MENU') {
        const filtered = await retrieveMenu(parsed.constraints);
        retrievedItems = rankMenuItems(filtered, parsed.constraints, messageText);
        for (const item of retrievedItems) {
          if (!recentItemIds.includes(item.item_id)) {
            recentItemIds.unshift(item.item_id);
          }
        }
      }
    }

    const trimmedRecent = recentItemIds.slice(0, 5);

    // 4. Generate Response (with timeout)
    let reply = '';
    try {
      reply = await withTimeout(
        generateResponse(messageText, parsed, state.turns, retrievedItems, checkoutLink, ambiguousItems, orderSummary, state.preferred_language || 'en'),
        6000,
        'Response generation timeout'
      );
    } catch (error) {
      console.warn('[CHAT ORCHESTRATOR] AI Response Generation failed/timed out, falling back:', error);
      reply = getDeterministicFallback(parsed.intent, messageText, checkoutLink, orderSummary, ambiguousItems, retrievedItems);
    }

    // 5. Update Memory
    await updateConversationState(
      phone,
      {
        last_intent: parsed.intent,
        recent_item_ids: trimmedRecent
      },
      {
        role: 'user',
        content: messageText,
        timestamp: Date.now()
      }
    );
    await updateConversationState(phone, {}, {
      role: 'model',
      content: reply,
      timestamp: Date.now() + 1
    });

    return { reply };
  }
};
