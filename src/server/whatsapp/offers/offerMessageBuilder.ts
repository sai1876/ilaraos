import { Offer } from './offerBroadcastTypes';
import { SupportedLanguage } from '../chat/types';

const TRANSLATIONS: Record<SupportedLanguage, { greeting: string; validity: string; orderNow: string; discount: string }> = {
  en: { greeting: 'Hi! Here is a special offer for you:', validity: 'Valid until:', orderNow: 'Order Now:', discount: 'Discount:' },
  hi: { greeting: 'नमस्ते! आपके लिए एक खास ऑफर:', validity: 'कब तक मान्य:', orderNow: 'अभी ऑर्डर करें:', discount: 'छूट:' },
  te: { greeting: 'నమస్కారం! మీ కోసం ఒక ప్రత్యేక ఆఫర్:', validity: 'ఇంతవరకు చెల్లుతుంది:', orderNow: 'ఇప్పుడే ఆర్డర్ చేయండి:', discount: 'డిస్కౌంట్:' },
  ta: { greeting: 'வணக்கம்! உங்களுக்கான ஒரு சிறப்பு சலுகை:', validity: 'செல்லுபடியாகும்:', orderNow: 'இப்போதே ஆர்டர் செய்யுங்கள்:', discount: 'தள்ளுபடி:' },
  kn: { greeting: 'ನಮಸ್ಕಾರ! ನಿಮಗಾಗಿ ವಿಶೇಷ ಆಫರ್:', validity: 'ವ್ಯಾಲಿಡಿಟಿ:', orderNow: 'ಈಗಲೇ ಆರ್ಡರ್ ಮಾಡಿ:', discount: 'ರಿಯಾಯಿತಿ:' },
  ml: { greeting: 'നമസ്കാരം! നിങ്ങൾക്കായി ഒരു പ്രത്യേക ഓഫർ:', validity: 'സാധുത:', orderNow: 'ഇപ്പോൾ ഓർഡർ ചെയ്യുക:', discount: 'കിഴിവ്:' },
  mr: { greeting: 'नमस्कार! तुमच्यासाठी एक खास ऑफर:', validity: 'येथपर्यंत वैध:', orderNow: 'आत्ताच ऑर्डर करा:', discount: 'सूट:' },
  bn: { greeting: 'নমস্কার! আপনার জন্য একটি বিশেষ অফার:', validity: 'বৈধতা:', orderNow: 'এখনই অর্ডার করুন:', discount: 'ছাড়:' },
  gu: { greeting: 'નમસ્તે! તમારા માટે એક ખાસ ઑફર:', validity: 'માન્યતા:', orderNow: 'હમણાં ઑર્ડર કરો:', discount: 'ડિસ્કાઉન્ટ:' },
  pa: { greeting: 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ! ਤੁਹਾਡੇ ਲਈ ਇੱਕ ਖਾਸ ਪੇਸ਼ਕਸ਼:', validity: 'ਇਸ ਤੱਕ ਵੈਧ:', orderNow: 'ਹੁਣੇ ਆਰਡਰ ਕਰੋ:', discount: 'ਛੋਟ:' },
  or: { greeting: 'ନମସ୍କାର! ଆପଣଙ୍କ ପାଇଁ ଏକ ବିଶେଷ ଅଫର:', validity: 'ବୈଧତା:', orderNow: 'ଏବେ ଅର୍ଡର କରନ୍ତୁ:', discount: 'ରିହାତି:' },
  ur: { greeting: 'ہیلو! آپ کے لئے ایک خاص پیشکش:', validity: 'تک درست:', orderNow: 'ابھی آرڈر کریں:', discount: 'ڈسکاؤنٹ:' },
};

/**
 * Deterministically formats the standard WhatsApp offer message.
 * It respects the customer's preferred language.
 */
export function buildOfferMessage(offer: Offer, preferredLanguage: SupportedLanguage): string {
  const t = TRANSLATIONS[preferredLanguage] || TRANSLATIONS.en;

  const dateStr = new Date(offer.valid_until).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric'
  });

  let message = `*${offer.title}*\n\n${offer.description}\n\n`;

  if (offer.discount_percentage) {
    message += `${t.discount} ${offer.discount_percentage}%\n`;
  } else if (offer.discount_amount) {
    message += `${t.discount} ₹${offer.discount_amount}\n`;
  }

  message += `\n${t.validity} ${dateStr}`;

  if (offer.website_url) {
    message += `\n\n${t.orderNow} ${offer.website_url}`;
  }

  return `${t.greeting}\n\n${message}`;
}
