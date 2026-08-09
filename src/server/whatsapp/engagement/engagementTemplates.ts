export function getEngagementTemplate(language: 'en' | 'hi' | 'te'): string {
  switch (language) {
    case 'hi':
      return 'Bhai sun — aa ja oasis pe, good food fixes everything. Kya order karein?';
    case 'te':
      return 'Em chestunnav? Baga aakali ga undha? Ilara nunchi emaina order cheddama?';
    case 'en':
    default:
      return "Haven't ordered yet? Good food might fix the evening. Want me to suggest something?";
  }
}
