import { adminDb } from '@/lib/firebaseAdmin';
import { IntentConstraints } from './types';
import { MenuItem } from '@/lib/types';

export async function retrieveMenu(constraints?: IntentConstraints): Promise<MenuItem[]> {
  if (!adminDb) throw new Error('Firebase Admin DB not initialized');
  
  const snap = await adminDb.collection('menu').where('is_available', '==', true).get();
  let items = snap.docs.map(d => d.data() as MenuItem);
  
  if (constraints) {
    if (constraints.category) {
      const catLower = constraints.category.toLowerCase();
      // Only keep items matching the category (soft match string)
      items = items.filter(i => i.category.toLowerCase().includes(catLower));
    }
    
    if (constraints.maxPrice !== undefined) {
      items = items.filter(i => i.price <= constraints.maxPrice!);
    }
    
    if (constraints.excludedTerms && constraints.excludedTerms.length > 0) {
      items = items.filter(i => {
        const text = `${i.name} ${i.description || ''}`.toLowerCase();
        return !constraints.excludedTerms!.some(term => text.includes(term.toLowerCase()));
      });
    }
  }
  
  return items;
}
