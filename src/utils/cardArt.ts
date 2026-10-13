/**
 * Visual Card Artwork Engine for CIRCLE OF SHAQ
 *
 * Provides curated, high-resolution scenic background photography (like spyfall.co's visual location cards)
 * combined with a guaranteed instant SVG scenic backdrop fallback so every single one of the 116 cards
 * across all 4 decks renders as a lush illustrated image card with bold overlaid text!
 */

const CARD_PHOTO_MAP: Record<string, string> = {
  // DECK 1: CLASSIC LOCATIONS (36)
  'Airplane': 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=600&q=75',
  'Bank': 'https://images.unsplash.com/photo-1501167786227-4cba60f6d58f?auto=format&fit=crop&w=600&q=75',
  'Beach': 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=75',
  'Casino': 'https://images.unsplash.com/photo-1596838132731-3301c3fd4317?auto=format&fit=crop&w=600&q=75',
  'Circus': 'https://images.unsplash.com/photo-1513889961551-628c1e5e2ee9?auto=format&fit=crop&w=600&q=75',
  'Luxury Spa': 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=600&q=75',
  'Embassy': 'https://images.unsplash.com/photo-1541872703-74c5e44368f9?auto=format&fit=crop&w=600&q=75',
  'Hospital': 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=600&q=75',
  'Grand Hotel': 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=600&q=75',
  'Military Base': 'https://images.unsplash.com/photo-1508614589041-895b88991e3e?auto=format&fit=crop&w=600&q=75',
  'Movie Studio': 'https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&w=600&q=75',
  'Ocean Liner': 'https://images.unsplash.com/photo-1548574505-5e239809ee19?auto=format&fit=crop&w=600&q=75',
  'Passenger Train': 'https://images.unsplash.com/photo-1474487548417-781cb71495f3?auto=format&fit=crop&w=600&q=75',
  'Pirate Ship': 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=600&q=75',
  'Polar Station': 'https://images.unsplash.com/photo-1517783999520-f068d7431a60?auto=format&fit=crop&w=600&q=75',
  'Police Station': 'https://images.unsplash.com/photo-1453873531674-2151bcd01707?auto=format&fit=crop&w=600&q=75',
  'Fine Restaurant': 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=600&q=75',
  'High School': 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=600&q=75',
  'Auto Repair Shop': 'https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?auto=format&fit=crop&w=600&q=75',
  'Space Station': 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=600&q=75',
  'Submarine': 'https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=600&q=75',
  'Sports Stadium': 'https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=600&q=75',
  'Supermarket': 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=600&q=75',
  'Broadway Theater': 'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?auto=format&fit=crop&w=600&q=75',
  'University': 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&w=600&q=75',
  'Coal Mine': 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=600&q=75',
  'Art Gallery': 'https://images.unsplash.com/photo-1518998053901-5348d3961a04?auto=format&fit=crop&w=600&q=75',
  'Nightclub': 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=600&q=75',
  'Amusement Park': 'https://images.unsplash.com/photo-1513889961551-628c1e5e2ee9?auto=format&fit=crop&w=600&q=75',
  'Shopping Mall': 'https://images.unsplash.com/photo-1519567241046-7f570eee3ce6?auto=format&fit=crop&w=600&q=75',
  'Bowling Alley': 'https://images.unsplash.com/photo-1538511059256-0642123c6203?auto=format&fit=crop&w=600&q=75',
  'City Zoo': 'https://images.unsplash.com/photo-1534567153574-2b12153a87f0?auto=format&fit=crop&w=600&q=75',
  'Ice Hockey Arena': 'https://images.unsplash.com/photo-1515703407324-5f753afd8be8?auto=format&fit=crop&w=600&q=75',
  'Central Library': 'https://images.unsplash.com/photo-1507842229356-51c61504d3ab?auto=format&fit=crop&w=600&q=75',
  'Vineyard Estate': 'https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?auto=format&fit=crop&w=600&q=75',
  'Royal Wedding': 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=600&q=75',

  // DECK 2: DESI ADDA & SHAADI (24)
  'Big Fat Indian Shaadi': 'https://images.unsplash.com/photo-1583939003579-730e3918a45a?auto=format&fit=crop&w=600&q=75',
  'Tapri Chai Stall': 'https://images.unsplash.com/photo-1561336313-0bd5e0b27ec8?auto=format&fit=crop&w=600&q=75',
  'Indian Railways Sleeper Coach': 'https://images.unsplash.com/photo-1532375810709-75b1da00537c?auto=format&fit=crop&w=600&q=75',
  'Goa Beach Shack': 'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=600&q=75',
  'Housing Society AGM': 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=600&q=75',
  'Sarojini / Colaba Street Market': 'https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?auto=format&fit=crop&w=600&q=75',
  'IPL Stadium Stand': 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?auto=format&fit=crop&w=600&q=75',
  'Bangalore Tech Park': 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=600&q=75',
  'Highway Punjabi Dhaba': 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=600&q=75',
  'Kota / Delhi Coaching Center': 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=600&q=75',
  'Bollywood Film Set': 'https://images.unsplash.com/photo-1478720568477-152d9b164e26?auto=format&fit=crop&w=600&q=75',
  'RTO Driving Test Track': 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=600&q=75',
  'Mumbai Local Ladies/Gen Coach': 'https://images.unsplash.com/photo-1567157577867-05ccb1388e66?auto=format&fit=crop&w=600&q=75',
  'Navratri Garba Ground': 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=600&q=75',
  'Hill Station Maggi Point': 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=600&q=75',
  'Barbershop / Local Salon': 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=600&q=75',
  'Diwali Teen-Patti House Party': 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=600&q=75',
  'Old Delhi / Chandni Chowk Galli': 'https://images.unsplash.com/photo-1587474260584-136574528ed5?auto=format&fit=crop&w=600&q=75',
  'Arranged Marriage Living Room': 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=600&q=75',
  'Cricket Gully / Colony Park': 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?auto=format&fit=crop&w=600&q=75',
  'South Indian Darshini / Cafe': 'https://images.unsplash.com/photo-1630383249896-424e482df921?auto=format&fit=crop&w=600&q=75',
  'Panchayat / Village Chaupal': 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=600&q=75',
  'Astrology & Tarot Chamber': 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=600&q=75',
  'Late-Night BPO / Call Center': 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=600&q=75',

  // DECK 3: WILD KINGDOM ANIMALS (28)
  'African Lion': 'https://images.unsplash.com/photo-1546182990-dffeafbe841d?auto=format&fit=crop&w=600&q=75',
  'Blue Whale': 'https://images.unsplash.com/photo-1568430462989-44163eb1752f?auto=format&fit=crop&w=600&q=75',
  'Elephant': 'https://images.unsplash.com/photo-1557050543-4d5f4e07ef46?auto=format&fit=crop&w=600&q=75',
  'Giraffe': 'https://images.unsplash.com/photo-1547721064-da6cfb341d50?auto=format&fit=crop&w=600&q=75',
  'Zebra': 'https://images.unsplash.com/photo-1501706362039-c06b2d715385?auto=format&fit=crop&w=600&q=75',
  'Chimpanzee': 'https://images.unsplash.com/photo-1540573133985-87b6da6d54a9?auto=format&fit=crop&w=600&q=75',
  'Scarlet Macaw': 'https://images.unsplash.com/photo-1552728089-57bdde30beb3?auto=format&fit=crop&w=600&q=75',
  'Great White Shark': 'https://images.unsplash.com/photo-1560275619-4662e36fa65c?auto=format&fit=crop&w=600&q=75',
  'Bald Eagle': 'https://images.unsplash.com/photo-1611689342806-0863700ce1e4?auto=format&fit=crop&w=600&q=75',
  'Emperor Penguin': 'https://images.unsplash.com/photo-1598439210625-5067c578f3f6?auto=format&fit=crop&w=600&q=75',
  'Red Kangaroo': 'https://images.unsplash.com/photo-1579972363865-9332f28f6c01?auto=format&fit=crop&w=600&q=75',
  'Giant Panda': 'https://images.unsplash.com/photo-1564349683136-77e08dba1ef7?auto=format&fit=crop&w=600&q=75',
  'Bottlenose Dolphin': 'https://images.unsplash.com/photo-1607153333879-c174d265f1d2?auto=format&fit=crop&w=600&q=75',
  'Grizzly Bear': 'https://images.unsplash.com/photo-1530595467537-0b5996c41f2d?auto=format&fit=crop&w=600&q=75',
  'Gray Wolf': 'https://images.unsplash.com/photo-1564466809058-bf4114d55352?auto=format&fit=crop&w=600&q=75',
  'Red Fox': 'https://images.unsplash.com/photo-1474511320723-9a56873867b5?auto=format&fit=crop&w=600&q=75',
  'Ostrich': 'https://images.unsplash.com/photo-1551085254-e96b210db58a?auto=format&fit=crop&w=600&q=75',
  'Wild Mustang': 'https://images.unsplash.com/photo-1553284965-83fd3e82fa5a?auto=format&fit=crop&w=600&q=75',
  'Bengal Tiger': 'https://images.unsplash.com/photo-1561731216-c3a4d99437d5?auto=format&fit=crop&w=600&q=75',
  'King Cobra': 'https://images.unsplash.com/photo-1531386151447-fd76ad50012f?auto=format&fit=crop&w=600&q=75',
  'Silverback Gorilla': 'https://images.unsplash.com/photo-1548550023-2bdb3c5beed7?auto=format&fit=crop&w=600&q=75',
  'Nile Crocodile': 'https://images.unsplash.com/photo-1575550959106-5a7defe28b56?auto=format&fit=crop&w=600&q=75',
  'Sea Turtle': 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=600&q=75',
  'Cheetah': 'https://images.unsplash.com/photo-1456926631375-92c8ce872def?auto=format&fit=crop&w=600&q=75',
  'Snowy Owl': 'https://images.unsplash.com/photo-1543549790-8b5f4a028cfb?auto=format&fit=crop&w=600&q=75',
  'Chameleon': 'https://images.unsplash.com/photo-1504450874802-0ba2bcd9b5ae?auto=format&fit=crop&w=600&q=75',
  'Giant Octopus': 'https://images.unsplash.com/photo-1545671913-b89ac1b4ac10?auto=format&fit=crop&w=600&q=75',
  'Rhinoceros': 'https://images.unsplash.com/photo-1535338454770-8be927b5a00b?auto=format&fit=crop&w=600&q=75',

  // DECK 4: WORLD NATIONS (24)
  'India': 'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=600&q=75',
  'Japan': 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=600&q=75',
  'Italy': 'https://images.unsplash.com/photo-1523906834658-6e24ef2386f9?auto=format&fit=crop&w=600&q=75',
  'Brazil': 'https://images.unsplash.com/photo-1483729558449-99ef09a8c325?auto=format&fit=crop&w=600&q=75',
  'France': 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=600&q=75',
  'United States': 'https://images.unsplash.com/photo-1485738422979-f5c462d49f74?auto=format&fit=crop&w=600&q=75',
  'Egypt': 'https://images.unsplash.com/photo-1539650116574-8efeb43e2750?auto=format&fit=crop&w=600&q=75',
  'Switzerland': 'https://images.unsplash.com/photo-1530122037265-a5f1f91d3b99?auto=format&fit=crop&w=600&q=75',
  'Mexico': 'https://images.unsplash.com/photo-1518638150340-f706e86654de?auto=format&fit=crop&w=600&q=75',
  'United Kingdom': 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=600&q=75',
  'Australia': 'https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?auto=format&fit=crop&w=600&q=75',
  'Germany': 'https://images.unsplash.com/photo-1467269204594-9661b134dd2b?auto=format&fit=crop&w=600&q=75',
  'South Korea': 'https://images.unsplash.com/photo-1517154421773-0529f29ea451?auto=format&fit=crop&w=600&q=75',
  'Thailand': 'https://images.unsplash.com/photo-1528181304800-259b08848526?auto=format&fit=crop&w=600&q=75',
  'Canada': 'https://images.unsplash.com/photo-1503614472-8c93d56e92ce?auto=format&fit=crop&w=600&q=75',
  'Spain': 'https://images.unsplash.com/photo-1543783207-ec64e4d95325?auto=format&fit=crop&w=600&q=75',
  'Greece': 'https://images.unsplash.com/photo-1533105079780-92b9be482077?auto=format&fit=crop&w=600&q=75',
  'Turkey': 'https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?auto=format&fit=crop&w=600&q=75',
  'Netherlands': 'https://images.unsplash.com/photo-1512470876302-972faa2aa9a4?auto=format&fit=crop&w=600&q=75',
  'United Arab Emirates': 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=600&q=75',
  'New Zealand': 'https://images.unsplash.com/photo-1469521669194-babb45599def?auto=format&fit=crop&w=600&q=75',
  'Kenya': 'https://images.unsplash.com/photo-1516426122078-c23e76319801?auto=format&fit=crop&w=600&q=75',
  'Argentina': 'https://images.unsplash.com/photo-1589909202802-8f4aadce1849?auto=format&fit=crop&w=600&q=75',
  'Norway': 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=600&q=75',
};

const PALETTES = [
  ['#be123c', '#7c2d12', '#0f172a'],
  ['#0369a1', '#1e3a8a', '#090d16'],
  ['#047857', '#064e3b', '#0a0f18'],
  ['#b45309', '#78350f', '#11131f'],
  ['#6d28d9', '#311042', '#090b12'],
  ['#0f766e', '#134e4a', '#0b101b'],
];

/**
 * Generates an instant, rich SVG scenic artwork data URI so even before a photo finishes loading
 * (or if a player is on slow mobile data), every card has a vivid illustrated background!
 */
export function getFallbackCardSvgUrl(cardName: string, emoji: string): string {
  let hash = 0;
  for (let i = 0; i < cardName.length; i++) {
    hash = (hash * 31 + cardName.charCodeAt(i)) >>> 0;
  }
  const [c1, c2, c3] = PALETTES[hash % PALETTES.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="400" height="240">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${c1}"/>
        <stop offset="55%" stop-color="${c2}"/>
        <stop offset="100%" stop-color="${c3}"/>
      </linearGradient>
    </defs>
    <rect width="400" height="240" fill="url(#g)"/>
    <circle cx="330" cy="50" r="85" fill="rgba(255,255,255,0.08)"/>
    <path d="M0 190 Q 110 130 220 175 T 400 145 L 400 240 L 0 240 Z" fill="rgba(0,0,0,0.32)"/>
    <text x="325" y="135" font-size="92" text-anchor="middle" opacity="0.26">${emoji}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Returns a CSS `backgroundImage` value stacking the dark readability gradient,
 * the high-res scenic photograph, and the instant SVG artwork fallback!
 */
export function getCardBackgroundStyle(cardName: string, emoji: string): React.CSSProperties {
  const photoUrl = CARD_PHOTO_MAP[cardName];
  const fallbackSvg = getFallbackCardSvgUrl(cardName, emoji);

  const bgLayers = [
    'linear-gradient(to top, rgba(7, 8, 13, 0.94) 0%, rgba(7, 8, 13, 0.52) 55%, rgba(7, 8, 13, 0.25) 100%)',
  ];
  if (photoUrl) {
    bgLayers.push(`url("${photoUrl}")`);
  }
  bgLayers.push(`url("${fallbackSvg}")`);

  return {
    backgroundImage: bgLayers.join(', '),
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
}
