'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Image as ImageIcon,
  CheckCircle,
  RefreshCw,
  Upload,
  Save,
  Smartphone,
  X,
  Plus,
  Trash2,
  Edit2,
  Calendar,
  Monitor
} from 'lucide-react';
import { 
  streamUIConfig, 
  saveUIConfig, 
  fetchMenuItems, 
  streamSliderItems, 
  saveSliderItem, 
  deleteSliderItem,
  streamCalendarEvents,
  saveCalendarEvent,
  deleteCalendarEvent
} from '@/lib/dbService';
import { generateSlideDetails } from '@/lib/geminiService';
import { MenuItem, UIConfig, SliderItem, GridCard, SummerDrinkItem, SummerCategoryItem } from '@/lib/types';
import { getCalendarEventConfig, DynamicCalendarEvent, defaultCalendarEvents } from '@/lib/calendarEvents';
import { uploadFileViaIntent } from '@/lib/fileUpload';


export default function UIAtmosphereManager() {
  // Store settings state
  const [activeTheme, setActiveTheme] = useState<'default' | 'exam' | 'raining' | 'fest' | 'night' | 'valentines' | 'scorching' | 'custom'>('default');
  const [autoCalendarMode, setAutoCalendarMode] = useState(false);
  const [mockDateStr, setMockDateStr] = useState('');
  const [globalAutoScrollEnabled, setGlobalAutoScrollEnabled] = useState(false);
  const [globalAutoScrollInterval, setGlobalAutoScrollInterval] = useState(5000);
  const [headline, setHeadline] = useState('Your escape from the heat.');
  const [subText, setSubText] = useState('Mist-cooling and chilled vibes.');
  const [bannerActive, setBannerActive] = useState(true);
  const [bannerText, setBannerText] = useState('Beat the heat — order ready in 8 mins');
  const [bannerColor, setBannerColor] = useState<'golden' | 'urgent' | 'success' | 'dark'>('golden');
  const [heroImageUrl, setHeroImageUrl] = useState('');
  const [socialStats, setSocialStats] = useState<{value: string; label: string}[]>([
    { value: '3,600+', label: 'Students' },
    { value: '8 min', label: 'Avg Pickup' },
    { value: '₹15', label: 'Delivery Fee' }
  ]);
  const [socialStatsActive, setSocialStatsActive] = useState(true);

  // Atmosphere 2.0 storefront customization states
  const [forceManualOverride, setForceManualOverride] = useState(false);
  const [primaryAccentColor, setPrimaryAccentColor] = useState("#f59e0b");
  const [bgColor, setBgColor] = useState("#342015");
  const [headlineColor, setHeadlineColor] = useState("#ffffff");
  const [subtitleColor, setSubtitleColor] = useState("#f3f1e9");
  const [btnBgColor, setBtnBgColor] = useState("#f59e0b");
  const [btnTextColor, setBtnTextColor] = useState("#613b00");
  const [bannerBgColor, setBannerBgColor] = useState("#f59e0b");
  const [bannerTextColor, setBannerTextColor] = useState("#3b1f00");

  const [fontFamily, setFontFamily] = useState<"Playfair Display" | "Poppins" | "Inter" | "Lora" | "Merriweather">("Poppins");
  const [headlineFontSize, setHeadlineFontSize] = useState(56);
  const [subtitleFontSize, setSubtitleFontSize] = useState(18);
  const [fontWeight, setFontWeight] = useState<"400" | "500" | "600" | "700" | "800">("700");
  const [textAlign, setTextAlign] = useState<"left" | "center" | "right">("left");

  const [heroBgType, setHeroBgType] = useState<"VIDEO" | "IMAGE" | "COLOR" | "GRADIENT">("VIDEO");
  const [heroBgValue, setHeroBgValue] = useState("");
  const [heroOverlayOpacity, setHeroOverlayOpacity] = useState(60);
  const [cta1Label, setCta1Label] = useState("Order now");
  const [cta1Url, setCta1Url] = useState("/menu");
  const [cta2Label, setCta2Label] = useState("See combos");
  const [cta2Url, setCta2Url] = useState("#combos");

  const [showFeaturedItems, setShowFeaturedItems] = useState(true);
  const [showCombos, setShowCombos] = useState(true);
  const [showStoreStats, setShowStoreStats] = useState(true);

  const [popupEnabled, setPopupEnabled] = useState(false);
  const [popupTitle, setPopupTitle] = useState("");
  const [popupBody, setPopupBody] = useState("");
  const [popupFrequency, setPopupFrequency] = useState<"every_visit" | "once_per_session" | "once_per_day">("once_per_session");
  const [popupStartDate, setPopupStartDate] = useState("");
  const [popupEndDate, setPopupEndDate] = useState("");
  const [popupCtaLabel, setPopupCtaLabel] = useState("Claim Offer");
  const [popupCtaLink, setPopupCtaLink] = useState("/menu");
  const [popupPromoCode, setPopupPromoCode] = useState("");

  const [snapshotLabel, setSnapshotLabel] = useState("");
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const [iframeReloadKey, setIframeReloadKey] = useState(0);
  const [iframeDevice, setIframeDevice] = useState<"mobile" | "desktop">("mobile");

  const [isInitialized, setIsInitialized] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Dynamic Seasonal Campaign state
  const [calendarEvents, setCalendarEvents] = useState<DynamicCalendarEvent[]>([]);
  const [editingEvent, setEditingEvent] = useState<DynamicCalendarEvent | null>(null);
  const [isEditingEventOpen, setIsEditingEventOpen] = useState(false);
  
  // Event Form State
  const [eventTitle, setEventTitle] = useState('');
  const [eventStartMonth, setEventStartMonth] = useState(0);
  const [eventStartDay, setEventStartDay] = useState(1);
  const [eventEndMonth, setEventEndMonth] = useState(0);
  const [eventEndDay, setEventEndDay] = useState(1);
  const [eventTheme, setEventTheme] = useState<UIConfig['active_theme']>('default');
  const [eventLayoutMode, setEventLayoutMode] = useState<UIConfig['layout_mode']>('slider');
  const [eventHeadline, setEventHeadline] = useState('');
  const [eventSubText, setEventSubText] = useState('');
  const [eventBannerActive, setEventBannerActive] = useState(true);
  const [eventBannerText, setEventBannerText] = useState('');
  const [eventBannerColor, setEventBannerColor] = useState<UIConfig['banner_color']>('golden');
  const [eventBgImage, setEventBgImage] = useState('');
  const [eventDiscountPercent, setEventDiscountPercent] = useState(0);
  const [eventDiscountDesc, setEventDiscountDesc] = useState('');
  const [eventFeaturedItemIds, setEventFeaturedItemIds] = useState<string[]>([]);

  // Advanced Custom Particles State
  const [eventCustomParticles, setEventCustomParticles] = useState('');
  const [eventParticleCount, setEventParticleCount] = useState(15);
  const [eventParticleSize, setEventParticleSize] = useState(10);
  const [eventParticleSpeed, setEventParticleSpeed] = useState(10);
  const [eventParticleRotation, setEventParticleRotation] = useState(360);
  const [eventCustomAuroraColor, setEventCustomAuroraColor] = useState('#f8bc51');
  const [eventCustomBgColor, setEventCustomBgColor] = useState('#0A0604');
  const [eventAutoScrollEnabled, setEventAutoScrollEnabled] = useState(false);
  const [eventAutoScrollInterval, setEventAutoScrollInterval] = useState(5000);

  // Menu items list
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  
  // Hero Slider collection list
  const [sliderItems, setSliderItems] = useState<SliderItem[]>([]);
  const [editingSlide, setEditingSlide] = useState<SliderItem | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);

  // Slide Form state
  const [slideMenuItemId, setSlideMenuItemId] = useState('');
  const [slideTag, setSlideTag] = useState('');
  const [slideLine1, setSlideLine1] = useState('');
  const [slideLine2, setSlideLine2] = useState('');
  const [slideDesc, setSlideDesc] = useState('');
  const [slideImageUrl, setSlideImageUrl] = useState('');
  const [slideBlendMode, setSlideBlendMode] = useState<'normal' | 'screen' | 'multiply'>('normal');
  const [slidePrice, setSlidePrice] = useState(100);
  const [slideTime, setSlideTime] = useState(8);
  const [slideTagsText, setSlideTagsText] = useState(''); // comma-separated
  const [slideAccentColor, setSlideAccentColor] = useState('#f8bc51');
  const [slideBgColor, setSlideBgColor] = useState('radial-gradient(circle at center, #63503B 0%, #2A2118 100%)');
  const [slideSortOrder, setSlideSortOrder] = useState(1);

  // Image tab selector ('storefront' = general background, 'slide' = slide transparent png, 'grid_card' = grid board promotional banner)
  const [imageTab, setImageTab] = useState<'storefront' | 'slide' | 'grid_card' | 'summer_drink' | 'summer_cat' | 'salad_sprite'>('storefront');

  // Campaign Grid Layout Settings state
  const [layoutMode, setLayoutMode] = useState<'slider' | 'grid_board' | 'summer_sips' | 'premium_salad'>('slider');
  const [gridBoardTitle, setGridBoardTitle] = useState('Featured Specials');
  const [gridBoardBadgeText, setGridBoardBadgeText] = useState('');
  const [gridBoardRibbonText, setGridBoardRibbonText] = useState('');
  const [gridCards, setGridCards] = useState<GridCard[]>([]);

  // Premium Salad Hero Settings state
  const [saladBgGradient, setSaladBgGradient] = useState('radial-gradient(circle at 20% 10%, rgba(217, 230, 221, 0.55) 0%, rgba(25, 41, 30, 0.2) 50%, transparent 100%)');
  const [saladIngredientsSprite, setSaladIngredientsSprite] = useState('/images/ingredients_sprite.png');
  const [saladItem1Name, setSaladItem1Name] = useState('Cheddar Cheese');
  const [saladItem2Name, setSaladItem2Name] = useState('Lettuce');
  const [saladItem3Name, setSaladItem3Name] = useState('Tomato');
  const [saladItem4Name, setSaladItem4Name] = useState('Pickle');

  // Summer Campaign Settings State
  const [summerBgGradient, setSummerBgGradient] = useState('radial-gradient(circle at 20% 10%, rgba(255,243,186,0.55) 0%, rgba(253,186,116,0.2) 50%, transparent 100%)');
  const [summerHeroTitle, setSummerHeroTitle] = useState('Summer Chill Zone.');
  const [summerHeroSub, setSummerHeroSub] = useState('Crispy Golden Fries + Refreshing Cold Drinks = Perfect Summer.');
  const [summerDrinks, setSummerDrinks] = useState<SummerDrinkItem[]>([]);
  const [summerCategories, setSummerCategories] = useState<SummerCategoryItem[]>([]);

  // Grid Card Form state
  const [editingGridCard, setEditingGridCard] = useState<GridCard | null>(null);
  const [isAddingGridCard, setIsAddingGridCard] = useState(false);
  const [cardTitle, setCardTitle] = useState('');
  const [cardSubtitle, setCardSubtitle] = useState('');
  const [cardPriceText, setCardPriceText] = useState('');
  const [cardImageUrl, setCardImageUrl] = useState('');
  const [cardRedirectType, setCardRedirectType] = useState<'category' | 'item'>('category');
  const [cardRedirectValue, setCardRedirectValue] = useState('');
  const [cardBlendMode, setCardBlendMode] = useState<'normal' | 'screen' | 'multiply'>('normal');

  // Conversational prompt input


  const [generatingSlideAI, setGeneratingSlideAI] = useState(false);


  // File Upload states
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  // Live Preview Navigation index
  const [previewSlideIndex, setPreviewSlideIndex] = useState(0);

  const startEditEvent = (ev: DynamicCalendarEvent) => {
    setEditingEvent(ev);
    setIsEditingEventOpen(true);
    setEventTitle(ev.eventName);
    setEventStartMonth(ev.startMonth);
    setEventStartDay(ev.startDay);
    setEventEndMonth(ev.endMonth);
    setEventEndDay(ev.endDay);
    setEventTheme(ev.active_theme);
    setEventLayoutMode(ev.layout_mode || 'slider');
    setEventHeadline(ev.hero_headline);
    setEventSubText(ev.hero_sub);
    setEventBannerActive(ev.banner_active);
    setEventBannerText(ev.banner_text);
    setEventBannerColor(ev.banner_color || 'golden');
    setEventBgImage(ev.bg_image || '');
    setEventDiscountPercent(ev.automatic_discount?.discount_percent || 0);
    setEventDiscountDesc(ev.automatic_discount?.description || '');
    setEventFeaturedItemIds(ev.featuredItemIds || []);
    setEventCustomParticles(ev.custom_particles || '');
    setEventParticleCount(ev.particle_count || 15);
    setEventParticleSize(ev.particle_size || 10);
    setEventParticleSpeed(ev.particle_speed || 10);
    setEventParticleRotation(ev.particle_rotation || 360);
    setEventCustomAuroraColor(ev.custom_aurora_color || '#f8bc51');
    setEventCustomBgColor(ev.custom_bg_color || '#0A0604');
    setEventAutoScrollEnabled(ev.auto_scroll_enabled || false);
    setEventAutoScrollInterval(ev.auto_scroll_interval || 5000);
  };

  const startAddEvent = () => {
    const newId = `campaign_${Date.now()}`;
    const newEv: DynamicCalendarEvent = {
      id: newId,
      eventName: "New Campaign",
      startMonth: new Date().getMonth(),
      startDay: new Date().getDate(),
      endMonth: new Date().getMonth(),
      endDay: new Date().getDate(),
      active_theme: "default",
      layout_mode: "slider",
      hero_headline: "Amazing Offers",
      hero_sub: "Don't miss out",
      banner_active: false,
      banner_text: "",
      banner_color: "golden",
      custom_aurora_color: "#f8bc51",
      custom_bg_color: "#0A0604",
      auto_scroll_enabled: false,
      auto_scroll_interval: 5000,
    };
    startEditEvent(newEv);
  };

  const handleDeleteEvent = async (id: string) => {
    if (confirm("Are you sure you want to delete this campaign?")) {
      await deleteCalendarEvent(id);
      setIsEditingEventOpen(false);
      setEditingEvent(null);
    }
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEvent) return;

    const updatedData: Partial<DynamicCalendarEvent> = {
      eventName: eventTitle,
      startMonth: Number(eventStartMonth),
      startDay: Number(eventStartDay),
      endMonth: Number(eventEndMonth),
      endDay: Number(eventEndDay),
      active_theme: eventTheme,
      layout_mode: eventLayoutMode,
      hero_headline: eventHeadline,
      hero_sub: eventSubText,
      banner_active: eventBannerActive,
      banner_text: eventBannerText,
      banner_color: eventBannerColor,
      bg_image: eventBgImage,
      featuredItemIds: eventFeaturedItemIds,
      custom_particles: eventCustomParticles,
      particle_count: Number(eventParticleCount),
      particle_size: Number(eventParticleSize),
      particle_speed: Number(eventParticleSpeed),
      particle_rotation: Number(eventParticleRotation),
      custom_aurora_color: eventCustomAuroraColor,
      custom_bg_color: eventCustomBgColor,
      auto_scroll_enabled: eventAutoScrollEnabled,
      auto_scroll_interval: Number(eventAutoScrollInterval),
      automatic_discount: eventDiscountPercent > 0 ? {
        discount_percent: Number(eventDiscountPercent),
        description: eventDiscountDesc || `${eventTitle} Discount`
      } : null as any
    };

    await saveCalendarEvent(editingEvent.id, updatedData);
    setIsEditingEventOpen(false);
    setEditingEvent(null);
  };

  // Load configuration from Firestore on mount
  useEffect(() => {
    const unsubscribeConfig = streamUIConfig((config) => {
      if (!isInitialized) {
        setActiveTheme(config.active_theme || 'default');
        setHeadline(config.hero_headline || '');
        setSubText(config.hero_sub || '');
        setBannerActive(config.banner_active ?? true);
        setBannerText(config.banner_text || '');
        setBannerColor(config.banner_color || 'golden');
        setHeroImageUrl(config.hero_image || '');
        if (config.social_stats) setSocialStats(config.social_stats);
        setSocialStatsActive(config.social_stats_active ?? true);
        setAutoCalendarMode(config.auto_calendar_mode ?? false);
        setMockDateStr(config.mock_date || '');
        setGlobalAutoScrollEnabled(config.auto_scroll_enabled || false);
        setGlobalAutoScrollInterval(config.auto_scroll_interval || 5000);
        
        // Atmosphere 2.0 fields
        setForceManualOverride(config.force_manual_override ?? false);
        setPrimaryAccentColor(config.primary_accent_color || "#f59e0b");
        setBgColor(config.bg_color || "#342015");
        setHeadlineColor(config.headline_color || "#ffffff");
        setSubtitleColor(config.subtitle_color || "#f3f1e9");
        setBtnBgColor(config.btn_bg_color || "#f59e0b");
        setBtnTextColor(config.btn_text_color || "#613b00");
        setBannerBgColor(config.banner_bg_color || "#f59e0b");
        setBannerTextColor(config.banner_text_color || "#3b1f00");
        setFontFamily((config.font_family as any) || "Poppins");
        setHeadlineFontSize(config.headline_font_size ?? 56);
        setSubtitleFontSize(config.subtitle_font_size ?? 18);
        setFontWeight((config.font_weight as any) || "700");
        setTextAlign((config.text_align as any) || "left");
        setHeroBgType(config.hero_bg_type || "VIDEO");
        setHeroBgValue(config.hero_bg_value || "");
        setHeroOverlayOpacity(config.hero_overlay_opacity ?? 60);
        setCta1Label(config.cta1_label || "Order now");
        setCta1Url(config.cta1_url || "/menu");
        setCta2Label(config.cta2_url || "#combos");
        setShowFeaturedItems(config.show_featured_items ?? true);
        setShowCombos(config.show_combos ?? true);
        setShowStoreStats(config.show_store_stats ?? true);
        setPopupEnabled(config.popup_enabled ?? false);
        setPopupTitle(config.popup_title || "");
        setPopupBody(config.popup_body || "");
        setPopupFrequency((config.popup_frequency as any) || "once_per_session");
        setPopupStartDate(config.popup_start_date || "");
        setPopupEndDate(config.popup_end_date || "");
        setPopupCtaLabel(config.popup_cta_label || "Claim Offer");
        setPopupCtaLink(config.popup_cta_link || "/menu");
        setPopupPromoCode(config.popup_promo_code || "");
        
        // Campaign Grid Layout Settings
        setLayoutMode(config.layout_mode || 'slider');
        setGridBoardTitle(config.grid_board_title || 'Featured Specials');
        setGridBoardBadgeText(config.grid_board_badge_text || '');
        setGridBoardRibbonText(config.grid_board_ribbon_text || '');
        setGridCards(config.grid_cards || []);
        
        // Premium Salad Hero Settings
        if (config.premium_salad_settings) {
          setSaladBgGradient(config.premium_salad_settings.background_gradient || 'radial-gradient(circle at 20% 10%, rgba(217, 230, 221, 0.55) 0%, rgba(25, 41, 30, 0.2) 50%, transparent 100%)');
          setSaladIngredientsSprite(config.premium_salad_settings.ingredients_sprite_url || '/images/ingredients_sprite.png');
          setSaladItem1Name(config.premium_salad_settings.item1_name || 'Cheddar Cheese');
          setSaladItem2Name(config.premium_salad_settings.item2_name || 'Lettuce');
          setSaladItem3Name(config.premium_salad_settings.item3_name || 'Tomato');
          setSaladItem4Name(config.premium_salad_settings.item4_name || 'Pickle');
        }

        // Summer Campaign Settings
        if (config.summer_campaign_settings) {
          setSummerBgGradient(config.summer_campaign_settings.background_gradient);
          setSummerHeroTitle(config.summer_campaign_settings.hero_title);
          setSummerHeroSub(config.summer_campaign_settings.hero_subtitle);
          setSummerDrinks(config.summer_campaign_settings.drinks);
          setSummerCategories(config.summer_campaign_settings.categories);
        } else {
          // Defaults if null
          setSummerDrinks([
            { id: 'sip1', title: 'Chocolate Milkshake', imageUrl: '/milkshake.png', imageScale: 1.0, price: 110, originalPrice: 150, tag: 'Classic Sweet', desc: 'Smooth vanilla and rich chocolate blended with thick ice cream.', menuItemId: 'sip1' },
            { id: 'sip2', title: 'Mint Limeade', imageUrl: '/mojito.png', imageScale: 1.0, price: 60, originalPrice: 90, tag: 'Freshly Spritzed', desc: 'Muddled fresh organic garden mint, sweet citrus lime juice, and sparkling soda.', menuItemId: 'sip2' },
            { id: 'sip3', title: 'Mango Thickshake', imageUrl: '/thickshake.png', imageScale: 1.0, price: 90, originalPrice: 120, tag: 'Alfonso Delight', desc: 'Rich, thick organic yogurt blended with sweet hand-picked Alfonso mango puree.', menuItemId: 'sip3' }
          ]);
          setSummerCategories([
            { id: 'Refreshers', title: 'Refreshers', iconType: 'emoji', iconValue: '🍹', imageScale: 1.0, redirectCategory: 'Beverages' },
            { id: 'Cool Bites', title: 'Cool Bites', iconType: 'emoji', iconValue: '🌯', imageScale: 1.0, redirectCategory: 'Snacks' },
            { id: 'Ice-Creams', title: 'Ice-Creams', iconType: 'emoji', iconValue: '🍦', imageScale: 1.0, redirectCategory: 'Desserts' },
            { id: 'Meal Bundles', title: 'Meal Bundles', iconType: 'emoji', iconValue: '🍱', imageScale: 1.0, redirectCategory: 'Meals' }
          ]);
        }
        
        setIsInitialized(true);
      }
    });

    const unsubscribeSlider = streamSliderItems((items) => {
      setSliderItems(items);
    });

    const unsubscribeEvents = streamCalendarEvents((events) => {
      setCalendarEvents(events as DynamicCalendarEvent[]);
      if (events.length === 0) {
        defaultCalendarEvents.forEach((ev) => {
          saveCalendarEvent(ev.id, ev);
        });
      }
    });

    fetchMenuItems().then((items) => {
      setMenuItems(items);
    });

    return () => {
      unsubscribeConfig();
      unsubscribeSlider();
      unsubscribeEvents();
    };
  }, [isInitialized]);

  // Handle direct file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setUploadFile(e.target.files[0]);
      setUploadSuccess(false);
    }
  };

  // Upload image to Supabase Storage via intent
  const handleImageUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;

    setUploading(true);

    try {
      const document = await uploadFileViaIntent(uploadFile, {
        category: 'atmosphere',
        relatedEntityType: 'config',
        relatedEntityId: 'restaurant',
        originalFilename: uploadFile.name,
        mimeType: uploadFile.type,
        sizeBytes: uploadFile.size,
        accessLevel: 'public'
      });

      const NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const uploadedUrl = `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${document.bucket}/${document.object_path}`;
      
      setUploadSuccess(true);
      setUploadFile(null);

      if (imageTab === 'storefront') {
        setHeroImageUrl(uploadedUrl);
      } else if (imageTab === 'slide') {
        setSlideImageUrl(uploadedUrl);
      } else if (imageTab === 'grid_card') {
        setCardImageUrl(uploadedUrl);
      } else if (imageTab === 'salad_sprite') {
        setSaladIngredientsSprite(uploadedUrl);
      }
    } catch (error: any) {
      alert(error.message || 'Upload failed');
    }

    setUploading(false);
    setTimeout(() => setUploadSuccess(false), 3000);
  };

  // Remove storefront background image URL


  // Save storefront controls to public API
  const handleSaveSettings = async () => {
    setSavingSettings(true);
    setSaveSuccess(false);
    try {
      const payload = {
        active_theme: activeTheme,
        hero_headline: headline,
        hero_sub: subText,
        banner_active: bannerActive,
        banner_text: bannerText,
        banner_color: bannerColor,
        hero_image: heroImageUrl,
        social_stats: socialStats,
        social_stats_active: socialStatsActive,
        auto_calendar_mode: autoCalendarMode,
        mock_date: mockDateStr,
        auto_scroll_enabled: globalAutoScrollEnabled,
        auto_scroll_interval: Number(globalAutoScrollInterval),
        
        layout_mode: layoutMode,
        grid_board_title: gridBoardTitle,
        grid_board_badge_text: gridBoardBadgeText,
        grid_board_ribbon_text: gridBoardRibbonText,
        grid_cards: gridCards,

        summer_campaign_settings: {
          background_gradient: summerBgGradient,
          hero_title: summerHeroTitle,
          hero_subtitle: summerHeroSub,
          drinks: summerDrinks,
          categories: summerCategories
        },
        premium_salad_settings: {
          background_gradient: saladBgGradient,
          ingredients_sprite_url: saladIngredientsSprite,
          item1_name: saladItem1Name,
          item2_name: saladItem2Name,
          item3_name: saladItem3Name,
          item4_name: saladItem4Name
        },

        force_manual_override: forceManualOverride,
        primary_accent_color: primaryAccentColor,
        bg_color: bgColor,
        headline_color: headlineColor,
        subtitle_color: subtitleColor,
        btn_bg_color: btnBgColor,
        btn_text_color: btnTextColor,
        banner_bg_color: bannerBgColor,
        banner_text_color: bannerTextColor,
        font_family: fontFamily,
        headline_font_size: Number(headlineFontSize),
        subtitle_font_size: Number(subtitleFontSize),
        font_weight: fontWeight,
        text_align: textAlign,
        hero_bg_type: heroBgType,
        hero_bg_value: heroBgValue,
        hero_overlay_opacity: Number(heroOverlayOpacity),
        cta1_label: cta1Label,
        cta1_url: cta1Url,
        cta2_label: cta2Label,
        cta2_url: cta2Url,
        show_featured_items: showFeaturedItems,
        show_combos: showCombos,
        show_store_stats: showStoreStats,
        popup_enabled: popupEnabled,
        popup_title: popupTitle,
        popup_body: popupBody,
        popup_frequency: popupFrequency,
        popup_start_date: popupStartDate,
        popup_end_date: popupEndDate,
        popup_cta_label: popupCtaLabel,
        popup_cta_link: popupCtaLink,
        popup_promo_code: popupPromoCode,
      };

      const res = await fetch("/api/admin/storefront-settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error("Failed to save settings");
      }

      setSaveSuccess(true);
      setIframeReloadKey(prev => prev + 1); // Trigger iframe reload
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to save storefront settings:", err);
      alert("Failed to save storefront settings.");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveSnapshot = async () => {
    if (!snapshotLabel.trim()) {
      alert("Please enter a label for the snapshot.");
      return;
    }
    setSavingSnapshot(true);
    try {
      const configPayload = {
        active_theme: activeTheme,
        hero_headline: headline,
        hero_sub: subText,
        banner_active: bannerActive,
        banner_text: bannerText,
        banner_color: bannerColor,
        hero_image: heroImageUrl,
        social_stats: socialStats,
        social_stats_active: socialStatsActive,
        auto_calendar_mode: autoCalendarMode,
        mock_date: mockDateStr,
        auto_scroll_enabled: globalAutoScrollEnabled,
        auto_scroll_interval: Number(globalAutoScrollInterval),
        layout_mode: layoutMode,
        grid_board_title: gridBoardTitle,
        grid_board_badge_text: gridBoardBadgeText,
        grid_board_ribbon_text: gridBoardRibbonText,
        grid_cards: gridCards,
        summer_campaign_settings: {
          background_gradient: summerBgGradient,
          hero_title: summerHeroTitle,
          hero_subtitle: summerHeroSub,
          drinks: summerDrinks,
          categories: summerCategories
        },
        premium_salad_settings: {
          background_gradient: saladBgGradient,
          ingredients_sprite_url: saladIngredientsSprite,
          item1_name: saladItem1Name,
          item2_name: saladItem2Name,
          item3_name: saladItem3Name,
          item4_name: saladItem4Name
        },
        force_manual_override: forceManualOverride,
        primary_accent_color: primaryAccentColor,
        bg_color: bgColor,
        headline_color: headlineColor,
        subtitle_color: subtitleColor,
        btn_bg_color: btnBgColor,
        btn_text_color: btnTextColor,
        banner_bg_color: bannerBgColor,
        banner_text_color: bannerTextColor,
        font_family: fontFamily,
        headline_font_size: Number(headlineFontSize),
        subtitle_font_size: Number(subtitleFontSize),
        font_weight: fontWeight,
        text_align: textAlign,
        hero_bg_type: heroBgType,
        hero_bg_value: heroBgValue,
        hero_overlay_opacity: Number(heroOverlayOpacity),
        cta1_label: cta1Label,
        cta1_url: cta1Url,
        cta2_label: cta2Label,
        cta2_url: cta2Url,
        show_featured_items: showFeaturedItems,
        show_combos: showCombos,
        show_store_stats: showStoreStats,
        popup_enabled: popupEnabled,
        popup_title: popupTitle,
        popup_body: popupBody,
        popup_frequency: popupFrequency,
        popup_start_date: popupStartDate,
        popup_end_date: popupEndDate,
        popup_cta_label: popupCtaLabel,
        popup_cta_link: popupCtaLink,
        popup_promo_code: popupPromoCode,
      };

      const res = await fetch("/api/admin/storefront-settings/snapshot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          label: snapshotLabel,
          config: configPayload,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save snapshot");
      }

      alert("Snapshot saved successfully!");
      setSnapshotLabel("");
    } catch (err) {
      console.error(err);
      alert("Failed to save snapshot.");
    } finally {
      setSavingSnapshot(false);
    }
  };

  // Slide CRUD Actions
  const startEditSlide = (slide: SliderItem) => {
    setEditingSlide(slide);
    setIsAddingNew(false);
    setImageTab('slide');
    setSlideMenuItemId(slide.menuItemId);
    setSlideTag(slide.tag);
    setSlideLine1(slide.line1);
    setSlideLine2(slide.line2);
    setSlideDesc(slide.desc);
    setSlideImageUrl(slide.image_url);
    setSlideBlendMode(slide.blendMode || 'normal');
    setSlidePrice(slide.price);
    setSlideTime(slide.time);
    setSlideTagsText(slide.ingredients.join(', '));
    setSlideAccentColor(slide.accentColor);
    setSlideBgColor(slide.bgColor);
    setSlideSortOrder(slide.sort_order || 1);
    setUploadFile(null);
    setUploadSuccess(false);
  };

  const startAddNewSlide = () => {
    setEditingSlide(null);
    setIsAddingNew(true);
    setImageTab('slide');
    setSlideMenuItemId('');
    setSlideTag('');
    setSlideLine1('');
    setSlideLine2('');
    setSlideDesc('');
    setSlideImageUrl('');
    setSlideBlendMode('normal');
    setSlidePrice(100);
    setSlideTime(8);
    setSlideTagsText('');
    setSlideAccentColor('#f8bc51');
    setSlideBgColor('radial-gradient(circle at center, #63503B 0%, #2A2118 100%)');
    setSlideSortOrder(sliderItems.length + 1);
    setUploadFile(null);
    setUploadSuccess(false);
  };

  const handleSelectMenuItemForSlide = (itemId: string) => {
    setSlideMenuItemId(itemId);
    const item = menuItems.find(m => m.item_id === itemId);
    if (item) {
      setSlidePrice(item.price);
      setSlideDesc(item.description);
      // Auto-split name for line1 and line2
      const nameParts = item.name.split(' ');
      if (nameParts.length > 1) {
        setSlideLine1(nameParts.slice(0, -1).join(' '));
        setSlideLine2(nameParts[nameParts.length - 1]);
      } else {
        setSlideLine1(item.name);
        setSlideLine2('');
      }
      setSlideTag(item.category.toUpperCase());
    }
  };

  const handleGenerateAIDetails = async () => {
    if (!slideMenuItemId) {
      alert('Please select a linked menu item first.');
      return;
    }
    const item = menuItems.find(m => m.item_id === slideMenuItemId);
    if (!item) return;

    setGeneratingSlideAI(true);
    try {
      const details = await generateSlideDetails(item.name, item.category, item.description || '');
      setSlideTag(details.tag);
      setSlideDesc(details.desc);
      setSlideTagsText(details.tags.join(', '));
      setSlideAccentColor(details.accentColor);
      setSlideBgColor(details.bgColor);
    } catch (err) {
      console.error('Failed to generate slide details using AI:', err);
      alert('Failed to generate slide details using AI. Standard fallbacks applied.');
    } finally {
      setGeneratingSlideAI(false);
    }
  };

  const handleSaveSlide = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slideMenuItemId) {
      alert('Please select a linked menu item.');
      return;
    }
    if (!slideImageUrl) {
      alert('Please upload a transparent PNG image first.');
      return;
    }

    const slideId = editingSlide ? editingSlide.id : `s_${Math.random().toString(36).substring(7)}`;

    const newSlide: SliderItem = {
      id: slideId,
      menuItemId: slideMenuItemId,
      tag: slideTag || 'HIGHLIGHT',
      line1: slideLine1 || 'Title Line 1',
      line2: slideLine2 || 'Title Line 2',
      desc: slideDesc || 'Description text here...',
      image_url: slideImageUrl,
      blendMode: slideBlendMode,
      price: Number(slidePrice),
      time: Number(slideTime),
      ingredients: slideTagsText.split(',').map(s => s.trim()).filter(Boolean),
      accentColor: slideAccentColor,
      bgColor: slideBgColor,
      sort_order: Number(slideSortOrder)
    };

    try {
      await saveSliderItem(newSlide);
      alert(editingSlide ? 'Slide updated successfully!' : 'Slide added successfully!');
      setEditingSlide(null);
      setIsAddingNew(false);
      setUploadFile(null);
    } catch (err) {
      console.error(err);
      alert('Failed to save slide.');
    }
  };

  const handleDeleteSlide = async (id: string) => {
    if (!confirm('Are you sure you want to delete this slide from the storefront carousel?')) return;
    try {
      await deleteSliderItem(id);
      if (editingSlide?.id === id) {
        setEditingSlide(null);
      }
      // Adjust preview index if out of bounds
      if (previewSlideIndex >= sliderItems.length - 1 && previewSlideIndex > 0) {
        setPreviewSlideIndex(previewSlideIndex - 1);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to delete slide.');
    }
  };

  // Grid Card Actions
  const startEditGridCard = (card: GridCard) => {
    setEditingGridCard(card);
    setIsAddingGridCard(false);
    setImageTab('grid_card');
    setCardTitle(card.title);
    setCardSubtitle(card.subtitle || '');
    setCardPriceText(card.price_text || '');
    setCardImageUrl(card.image_url);
    setCardBlendMode(card.blendMode || 'normal');
    setCardRedirectType(card.redirect_type);
    setCardRedirectValue(card.redirect_value);
    setUploadFile(null);
    setUploadSuccess(false);
  };

  const startAddNewGridCard = () => {
    setEditingGridCard(null);
    setIsAddingGridCard(true);
    setImageTab('grid_card');
    setCardTitle('');
    setCardSubtitle('');
    setCardPriceText('');
    setCardImageUrl('');
    setCardBlendMode('normal');
    setCardRedirectType('category');
    setCardRedirectValue('');
    setUploadFile(null);
    setUploadSuccess(false);
  };





  

  

  const handleSaveGridCard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardTitle.trim()) {
      alert('Please enter a card title.');
      return;
    }
    if (!cardImageUrl.trim()) {
      alert('Please upload or specify a promotional graphic image.');
      return;
    }
    if (!cardRedirectValue.trim()) {
      alert('Please choose or enter a redirect target value.');
      return;
    }

    const cardId = editingGridCard ? editingGridCard.id : `c_${Math.random().toString(36).substring(7)}`;
    const newCard: GridCard = {
      id: cardId,
      title: cardTitle,
      subtitle: cardSubtitle || undefined,
      price_text: cardPriceText || undefined,
      image_url: cardImageUrl,
      blendMode: cardBlendMode,
      redirect_type: cardRedirectType,
      redirect_value: cardRedirectValue,
    };

    let updatedCards: GridCard[];
    if (editingGridCard) {
      updatedCards = gridCards.map(c => c.id === cardId ? newCard : c);
    } else {
      updatedCards = [...gridCards, newCard];
    }

    setGridCards(updatedCards);
    setEditingGridCard(null);
    setIsAddingGridCard(false);
  };

  const handleDeleteGridCard = (id: string) => {
    if (!confirm('Are you sure you want to remove this promo card?')) return;
    setGridCards(gridCards.filter(c => c.id !== id));
  };

  // Summer Drinks Actions


  const activeDate = mockDateStr ? new Date(mockDateStr) : new Date();
  const calendarEvent = getCalendarEventConfig(activeDate, calendarEvents);

    const isFieldDisabled = autoCalendarMode && !!calendarEvent && !forceManualOverride;

  // Resolve Campaign Grid Layout options
  const _effectiveLayoutMode = autoCalendarMode && calendarEvent && !forceManualOverride && calendarEvent.layout_mode ? calendarEvent.layout_mode : layoutMode;
  const effectiveGridCards = autoCalendarMode && calendarEvent && !forceManualOverride && calendarEvent.grid_cards ? calendarEvent.grid_cards : gridCards;

  // Helper for rendering theme background in live preview

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 text-[#1b1c17] w-full">
      {/* Top Banner / Bar */}
      <div className="xl:col-span-3 flex flex-col sm:flex-row items-center justify-between bg-white border border-[#d8c3ad] rounded-3xl shadow-sm p-6 gap-4">
        <div>
          <h2 className="font-serif italic text-2xl text-[#1b1c17]">Storefront Settings & Layout Customizer</h2>
          <p className="text-xs font-mono text-[#534434]/50 uppercase tracking-widest mt-0.5">Atmosphere 2.0 Engine</p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {/* Force Manual Override Toggle */}
          <div className="flex items-center gap-3 bg-amber-50/60 border border-amber-200 px-4 py-2 rounded-2xl">
            <div className="flex flex-col">
              <span className="font-serif italic font-bold text-xs text-[#1b1c17]">Force Override</span>
              <span className="text-[9px] text-[#534434]/70 font-mono">Ignore active campaign override</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={forceManualOverride}
                onChange={(e) => setForceManualOverride(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-[#e0d8cf] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#855300]"></div>
            </label>
          </div>

          {/* Toast / Status */}
          {saveSuccess && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-emerald-50 border border-emerald-200 text-[#006c49] font-bold text-xs px-4 py-2 rounded-2xl flex items-center gap-1.5"
            >
              <CheckCircle size={14} /> Saved & Live ✓
            </motion.div>
          )}

          {/* SAVE & PUBLISH Button */}
          <button
            onClick={handleSaveSettings}
            disabled={savingSettings}
            className="bg-[#855300] text-white hover:bg-[#6b4200] disabled:bg-[#e0d8cf] disabled:text-[#534434]/30 rounded-2xl py-3 px-6 font-mono font-bold text-xs uppercase tracking-widest transition-all shadow-md flex items-center gap-2"
          >
            {savingSettings ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <Save size={14} />
            )}
            Save & Publish to Storefront
          </button>
        </div>
      </div>

      {/* Column 1 & 2: Controls and Carousel Slide Editor */}
      <div className="xl:col-span-2 flex flex-col gap-6">
        
        {/* Storefront Layout Controls */}
        <div className="bg-white border border-[#d8c3ad] rounded-3xl shadow-sm p-6 flex flex-col gap-5">
          <h3 className="font-serif italic text-lg text-[#1b1c17] border-b border-[#d8c3ad]/60 pb-2">Manual Storefront Controls</h3>

          {/* Auto-Calendar Mode Switch */}
          <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 flex flex-col gap-3.5 mb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar size={18} className="text-[#855300] animate-pulse" />
                <div>
                  <span className="font-serif italic font-bold text-[#1b1c17] text-sm">Auto-Calendar Campaign Mode</span>
                  <p className="text-[10px] text-[#534434]/60 font-mono">Automatically adjusts storefront theme by calendar occasion</p>
                </div>
              </div>
              <div className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoCalendarMode}
                  onChange={(e) => setAutoCalendarMode(e.target.checked)}
                  className="sr-only peer"
                  id="auto-calendar-toggle"
                />
                <label htmlFor="auto-calendar-toggle" className="w-11 h-6 bg-[#e0d8cf] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-stone-400 after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#855300] peer-checked:after:bg-white cursor-pointer" />
              </div>
            </div>

            {autoCalendarMode && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex flex-col gap-2 font-mono text-xs">
                <div className="flex justify-between items-center text-[10px] uppercase text-[#534434]/40">
                  <span>Active Calendar Event Status</span>
                  <span className="text-[#855300] font-bold">Campaign Enabled</span>
                </div>
                {calendarEvent ? (
                  <div className="flex flex-col gap-1 text-[#855300]">
                    <span className="font-bold text-sm">📅 {calendarEvent.eventName} Active</span>
                    <p className="text-[10px] text-[#534434]/80 normal-case leading-relaxed">
                      Theme override is active. Today's theme: <strong className="text-[#1b1c17] uppercase font-mono">{calendarEvent.active_theme}</strong>.
                      Manual inputs are currently bypassed and locked.
                    </p>
                  </div>
                ) : (
                  <span className="text-[#534434]/65 text-[10px]">
                    No calendar campaign event active for today. Storefront falls back to manual settings.
                  </span>
                )}

                {/* Mock Testing Date input */}
                <div className="mt-2 border-t border-[#d8c3ad]/40 pt-2.5 flex flex-col gap-1.5">
                  <label className="text-[9px] uppercase tracking-wider text-[#534434]/55">Mock System Date (For Testing Campaigns):</label>
                  <div className="flex gap-2">
                    <select
                      value={mockDateStr}
                      onChange={(e) => {
                        const val = e.target.value;
                        setMockDateStr(val);
                        saveUIConfig({ mock_date: val });
                      }}
                      className="flex-1 bg-white border border-[#d8c3ad] rounded-lg px-2 py-1 text-2xs text-[#1b1c17] focus:outline-none"
                    >
                      <option value="">Use Current Date</option>
                      {calendarEvents.map(ev => {
                        const yr = new Date().getFullYear();
                        const paddedMonth = String(ev.startMonth + 1).padStart(2, '0');
                        const paddedDay = String(ev.startDay).padStart(2, '0');
                        const dateStr = `${yr}-${paddedMonth}-${paddedDay}`;
                        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                        return (
                          <option key={ev.id} value={dateStr}>
                            {ev.eventName} ({monthNames[ev.startMonth]} {ev.startDay})
                          </option>
                        );
                      })}
                    </select>
                    {mockDateStr && (
                      <button
                        type="button"
                        onClick={() => {
                          setMockDateStr("");
                          saveUIConfig({ mock_date: "" });
                        }}
                        className="text-[9px] bg-[#e0d8cf]/60 px-2 rounded-lg text-[#534434]"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[10px] uppercase tracking-wider text-[#534434]">Active Dynamic Theme</label>
              <select
                value={autoCalendarMode && calendarEvent ? calendarEvent.active_theme : activeTheme}
                onChange={(e) => setActiveTheme(e.target.value as any)}
                disabled={isFieldDisabled}
                className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm text-[#1b1c17] focus:outline-none focus:border-[#855300] transition-colors font-mono disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <option value="default">Default Amber Glow</option>
                <option value="raining">Twilight Raining Teal</option>
                <option value="exam">Studious Espresso Indigo</option>
                <option value="fest">Gold-Leaf Festive Mesh</option>
                <option value="night">Obsidian Midnight Purple</option>
                <option value="valentines">Sweet Valentine's Pink</option>
                <option value="scorching">Scorching Summer Orange</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[10px] uppercase tracking-wider text-[#534434]">Storefront Hero Layout Mode</label>
              <select
                value={autoCalendarMode && calendarEvent ? calendarEvent.layout_mode || "slider" : layoutMode}
                onChange={(e) => setLayoutMode(e.target.value as any)}
                disabled={isFieldDisabled}
                className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm text-[#1b1c17] focus:outline-none focus:border-[#855300] transition-colors font-mono disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <option value="slider">Platter Slider (Default)</option>
                <option value="grid_board">Campaign Grid Board (Blinkit Grid)</option>
                <option value="premium_salad">Premium Salad Hero (Stitch)</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="font-mono text-[10px] uppercase tracking-wider text-[#534434]">Storefront Headline</label>
            <textarea
              value={autoCalendarMode && calendarEvent ? calendarEvent.hero_headline : headline}
              onChange={(e) => setHeadline(e.target.value)}
              disabled={isFieldDisabled}
              rows={2}
              className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#855300] transition-colors disabled:opacity-40 disabled:cursor-not-allowed resize-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="font-mono text-[10px] uppercase tracking-wider text-[#534434]">Subtext Subtitle</label>
            <input
              type="text"
              value={autoCalendarMode && calendarEvent ? calendarEvent.hero_sub : subText}
              onChange={(e) => setSubText(e.target.value)}
              disabled={isFieldDisabled}
              className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#855300] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            />
          </div>

          <div className="flex flex-col gap-3.5 border-t border-[#d8c3ad]/40 pt-4 mt-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-[#534434] font-semibold">Active Operational Banner</span>
              <input
                type="checkbox"
                checked={autoCalendarMode && calendarEvent ? calendarEvent.banner_active : bannerActive}
                onChange={(e) => setBannerActive(e.target.checked)}
                disabled={isFieldDisabled}
                className="accent-[#855300] w-4 h-4 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
              />
            </div>
            
            {/* Global Auto Scroll Toggle */}
            <div className="flex flex-col gap-1.5 md:col-span-2">
                <div className="flex items-center justify-between p-3 bg-[#f5f4ec] border border-[#d8c3ad] rounded-xl opacity-90 hover:opacity-100 transition-opacity">
                  <div>
                    <p className="text-sm font-semibold text-[#1b1c17] font-serif italic">Global Auto Horizontal Scroll</p>
                    <p className="text-[10px] text-[#534434] font-mono uppercase tracking-widest mt-0.5">Applies when no campaign overrides it</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={globalAutoScrollEnabled}
                      onChange={(e) => setGlobalAutoScrollEnabled(e.target.checked)}
                      disabled={isFieldDisabled}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-[#e0d8cf] rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#d4c4b0] peer-checked:after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#855300] peer-disabled:opacity-50"></div>
                  </label>
                </div>
                {globalAutoScrollEnabled && (
                  <div className="flex flex-col gap-1.5 mt-2">
                    <label className="font-mono text-[9px] uppercase tracking-wider text-[#534434]">Scroll Interval (ms)</label>
                    <input
                      type="number"
                      value={globalAutoScrollInterval}
                      onChange={(e) => setGlobalAutoScrollInterval(Number(e.target.value))}
                      disabled={isFieldDisabled}
                      className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2 text-sm text-[#1b1c17] focus:outline-none focus:border-[#855300] font-mono disabled:opacity-40 disabled:cursor-not-allowed"
                      min="1000"
                      step="500"
                    />
                  </div>
                )}
            </div>
            
            {(autoCalendarMode && calendarEvent ? calendarEvent.banner_active : bannerActive) && (
              <div className="flex flex-col gap-1.5">
                <label className="font-mono text-[10px] uppercase tracking-wider text-[#534434]">Banner Message Text</label>
                <input
                  type="text"
                  value={autoCalendarMode && calendarEvent ? calendarEvent.banner_text : bannerText}
                  onChange={(e) => setBannerText(e.target.value)}
                  disabled={isFieldDisabled}
                  className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#855300] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>
            )}
          </div>

          {/* Social Proof Statistics Section */}
          <div className="border-t border-[#d8c3ad]/40 pt-6 mt-2">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-mono text-[10px] uppercase tracking-wider text-[#534434] flex items-center gap-2">
                <Sparkles size={12} className="text-[#855300]" />
                Store Statistics (Social Proof)
              </h4>
              <button
                type="button"
                onClick={() => setSocialStatsActive(!socialStatsActive)}
                className="relative inline-flex h-4 w-7 items-center rounded-full transition-colors bg-[#e0d8cf]"
              >
                <span className="inline-block h-3 w-3 transform rounded-full bg-white transition-transform translate-x-0.5" />
              </button>
            </div>
            {socialStatsActive ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {socialStats.map((stat, i) => (
                <div key={i} className="flex flex-col gap-2 p-3 bg-[#f5f4ec] border border-[#d8c3ad] rounded-xl relative group">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[9px] font-mono text-[#534434]/60 uppercase">Stat {i + 1}</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[8px] font-mono uppercase text-[#534434]/40">Large Value</label>
                    <input
                      type="text"
                      value={stat.value}
                      onChange={(e) => {
                        const newStats = [...socialStats];
                        newStats[i].value = e.target.value;
                        setSocialStats(newStats);
                      }}
                      placeholder="e.g. 3,600+"
                      className="bg-[#fbf9f1] border border-[#d8c3ad] rounded-lg px-3 py-1.5 text-xs text-[#855300] font-bold focus:outline-none focus:border-[#855300]/50"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[8px] font-mono uppercase text-[#534434]/40">Bottom Label</label>
                    <input
                      type="text"
                      value={stat.label}
                      onChange={(e) => {
                        const newStats = [...socialStats];
                        newStats[i].label = e.target.value;
                        setSocialStats(newStats);
                      }}
                      placeholder="e.g. Students"
                      className="bg-[#fbf9f1] border border-[#d8c3ad] rounded-lg px-3 py-1.5 text-xs text-[#1b1c17] focus:outline-none focus:border-[#855300]/50"
                    />
                  </div>
                </div>
              ))}
            </div>
            ) : null}
          </div>

          <div className="border-t border-[#d8c3ad]/40 pt-4 mt-2 flex items-center justify-between gap-4 flex-wrap">
            {/* Storefront Background Image Uploader */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setImageTab("storefront");
                  setUploadFile(null);
                  setUploadSuccess(false);
                  setIsAddingNew(false);
                  setEditingSlide(null);
                  const el = document.getElementById("media-hub-uploader");
                  el?.scrollIntoView({ behavior: "smooth" });
                }}
                className="bg-[#e0d8cf]/40 hover:bg-[#e0d8cf]/80 border border-[#d8c3ad] text-[#534434] px-4 py-2.5 rounded-xl font-mono text-[10px] uppercase tracking-wider transition-colors flex items-center gap-1.5"
              >
                <ImageIcon size={12} className="text-[#855300]" />
                Manage Storefront Bg
              </button>
              {heroImageUrl && (
                <span className="text-[9px] font-mono text-[#10b981] flex items-center gap-1">
                  <CheckCircle size={10} /> Active Bg
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Colors Settings Card */}
        <div className="bg-white border border-[#d8c3ad] rounded-3xl shadow-sm p-6 flex flex-col gap-5">
          <h3 className="font-serif italic text-lg text-[#1b1c17] border-b border-[#d8c3ad]/60 pb-2">Storefront Colors</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { label: "Primary Accent Color", val: primaryAccentColor, set: setPrimaryAccentColor },
              { label: "Background Color", val: bgColor, set: setBgColor },
              { label: "Headline Color", val: headlineColor, set: setHeadlineColor },
              { label: "Subtitle Color", val: subtitleColor, set: setSubtitleColor },
              { label: "Button Background Color", val: btnBgColor, set: setBtnBgColor },
              { label: "Button Text Color", val: btnTextColor, set: setBtnTextColor },
              { label: "Banner Background Color", val: bannerBgColor, set: setBannerBgColor },
              { label: "Banner Text Color", val: bannerTextColor, set: setBannerTextColor },
            ].map((col, idx) => (
              <div key={idx} className="flex flex-col gap-1.5">
                <label className="font-mono text-[10px] uppercase tracking-wider text-[#534434]">{col.label}</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={col.val}
                    onChange={(e) => col.set(e.target.value)}
                    disabled={isFieldDisabled}
                    className="w-10 h-10 rounded-lg cursor-pointer bg-white border border-[#d8c3ad]"
                  />
                  <input
                    type="text"
                    value={col.val}
                    onChange={(e) => col.set(e.target.value)}
                    disabled={isFieldDisabled}
                    className="flex-1 bg-white border border-[#d8c3ad] rounded-xl px-3 py-2 text-sm focus:outline-none"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Typography Settings Card */}
        <div className="bg-white border border-[#d8c3ad] rounded-3xl shadow-sm p-6 flex flex-col gap-5">
          <h3 className="font-serif italic text-lg text-[#1b1c17] border-b border-[#d8c3ad]/60 pb-2">Storefront Typography</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[10px] uppercase tracking-wider text-[#534434]">Font Family</label>
              <select
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value as any)}
                disabled={isFieldDisabled}
                className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm text-[#1b1c17] focus:outline-none"
              >
                {["Playfair Display", "Poppins", "Inter", "Lora", "Merriweather"].map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[10px] uppercase tracking-wider text-[#534434]">Font Weight</label>
              <select
                value={fontWeight}
                onChange={(e) => setFontWeight(e.target.value as any)}
                disabled={isFieldDisabled}
                className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm text-[#1b1c17] focus:outline-none"
              >
                {["400", "500", "600", "700", "800"].map(w => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5 md:col-span-2">
              <div className="flex justify-between items-center">
                <label className="font-mono text-[10px] uppercase tracking-wider text-[#534434]">Headline Font Size ({headlineFontSize}px)</label>
              </div>
              <input
                type="range"
                min="24"
                max="96"
                value={headlineFontSize}
                onChange={(e) => setHeadlineFontSize(Number(e.target.value))}
                disabled={isFieldDisabled}
                className="w-full accent-[#855300] cursor-pointer"
              />
            </div>

            <div className="flex flex-col gap-1.5 md:col-span-2">
              <div className="flex justify-between items-center">
                <label className="font-mono text-[10px] uppercase tracking-wider text-[#534434]">Subtitle Font Size ({subtitleFontSize}px)</label>
              </div>
              <input
                type="range"
                min="14"
                max="32"
                value={subtitleFontSize}
                onChange={(e) => setSubtitleFontSize(Number(e.target.value))}
                disabled={isFieldDisabled}
                className="w-full accent-[#855300] cursor-pointer"
              />
            </div>

            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="font-mono text-[10px] uppercase tracking-wider text-[#534434]">Text Alignment</label>
              <div className="flex gap-4">
                {(["left", "center", "right"] as const).map(align => (
                  <label key={align} className="flex items-center gap-2 text-sm font-semibold capitalize cursor-pointer text-[#1b1c17]">
                    <input
                      type="radio"
                      name="textAlign"
                      value={align}
                      checked={textAlign === align}
                      onChange={() => setTextAlign(align)}
                      disabled={isFieldDisabled}
                      className="accent-[#855300]"
                    />
                    {align}
                  </label>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* Hero Section Settings Card */}
        <div className="bg-white border border-[#d8c3ad] rounded-3xl shadow-sm p-6 flex flex-col gap-5">
          <h3 className="font-serif italic text-lg text-[#1b1c17] border-b border-[#d8c3ad]/60 pb-2">Hero Section Configuration</h3>
          <div className="flex flex-col gap-4">
            
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[10px] uppercase tracking-wider text-[#534434]">Background Type</label>
              <div className="flex gap-4">
                {(["VIDEO", "IMAGE", "COLOR", "GRADIENT"] as const).map(type => (
                  <label key={type} className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer text-[#1b1c17]">
                    <input
                      type="radio"
                      name="heroBgType"
                      value={type}
                      checked={heroBgType === type}
                      onChange={() => setHeroBgType(type)}
                      disabled={isFieldDisabled}
                      className="accent-[#855300]"
                    />
                    {type}
                  </label>
                ))}
              </div>
            </div>

            {heroBgType !== "VIDEO" && (
              <div className="flex flex-col gap-1.5">
                <label className="font-mono text-[10px] uppercase tracking-wider text-[#534434]">
                  {heroBgType === "IMAGE" ? "Hero Image URL" : heroBgType === "COLOR" ? "Background Color Hex" : "Gradient CSS (e.g. linear-gradient(...))"}
                </label>
                <input
                  type="text"
                  value={heroBgValue}
                  onChange={(e) => setHeroBgValue(e.target.value)}
                  disabled={isFieldDisabled}
                  placeholder={heroBgType === "IMAGE" ? "https://example.com/image.jpg" : heroBgType === "COLOR" ? "#342015" : "linear-gradient(90deg, #342015 0%, #1a0f06 100%)"}
                  className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <label className="font-mono text-[10px] uppercase tracking-wider text-[#534434]">Overlay Opacity ({heroOverlayOpacity}%)</label>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={heroOverlayOpacity}
                onChange={(e) => setHeroOverlayOpacity(Number(e.target.value))}
                disabled={isFieldDisabled}
                className="w-full accent-[#855300] cursor-pointer"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="font-mono text-[10px] uppercase tracking-wider text-[#534434]">CTA 1 Label</label>
                <input
                  type="text"
                  value={cta1Label}
                  onChange={(e) => setCta1Label(e.target.value)}
                  disabled={isFieldDisabled}
                  className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="font-mono text-[10px] uppercase tracking-wider text-[#534434]">CTA 1 Redirect URL</label>
                <input
                  type="text"
                  value={cta1Url}
                  onChange={(e) => setCta1Url(e.target.value)}
                  disabled={isFieldDisabled}
                  className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm focus:outline-none font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="font-mono text-[10px] uppercase tracking-wider text-[#534434]">CTA 2 Label</label>
                <input
                  type="text"
                  value={cta2Label}
                  onChange={(e) => setCta2Label(e.target.value)}
                  disabled={isFieldDisabled}
                  className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="font-mono text-[10px] uppercase tracking-wider text-[#534434]">CTA 2 Redirect URL</label>
                <input
                  type="text"
                  value={cta2Url}
                  onChange={(e) => setCta2Url(e.target.value)}
                  disabled={isFieldDisabled}
                  className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm focus:outline-none font-mono"
                />
              </div>
            </div>

          </div>
        </div>

        {/* Section Visibility Card */}
        <div className="bg-white border border-[#d8c3ad] rounded-3xl shadow-sm p-6 flex flex-col gap-5">
          <h3 className="font-serif italic text-lg text-[#1b1c17] border-b border-[#d8c3ad]/60 pb-2">Storefront Sections Visibility</h3>
          <div className="flex flex-col gap-4">
            
            {[
              { label: "Show Featured Items Section", val: showFeaturedItems, set: setShowFeaturedItems },
              { label: "Show Combos Section", val: showCombos, set: setShowCombos },
              { label: "Show Store Statistics (Social Proof)", val: showStoreStats, set: setShowStoreStats },
              { label: "Enable Announcement Popup", val: popupEnabled, set: setPopupEnabled },
            ].map((sec, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-[#f5f4ec] border border-[#d8c3ad] rounded-xl">
                <span className="text-sm font-semibold text-[#1b1c17]">{sec.label}</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sec.val}
                    onChange={(e) => sec.set(e.target.checked)}
                    disabled={isFieldDisabled}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-[#e0d8cf] rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#855300]"></div>
                </label>
              </div>
            ))}

          </div>
        </div>

        {/* Announcement Popup settings */}
        {popupEnabled && (
          <div className="bg-white border border-[#d8c3ad] rounded-3xl shadow-sm p-6 flex flex-col gap-5">
            <h3 className="font-serif italic text-lg text-[#1b1c17] border-b border-[#d8c3ad]/60 pb-2">📢 Announcement Popup Settings</h3>
            <div className="flex flex-col gap-4">
              
              <div className="flex flex-col gap-1.5">
                <label className="font-mono text-[10px] uppercase tracking-wider text-[#534434]">Popup Title *</label>
                <input
                  type="text"
                  value={popupTitle}
                  onChange={(e) => setPopupTitle(e.target.value)}
                  placeholder="e.g. Free Waffle Day! 🧇"
                  disabled={isFieldDisabled}
                  className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-mono text-[10px] uppercase tracking-wider text-[#534434]">Popup Description Body *</label>
                <textarea
                  value={popupBody}
                  onChange={(e) => setPopupBody(e.target.value)}
                  placeholder="e.g. Get a free Nutella waffle with orders above ₹300 today only."
                  disabled={isFieldDisabled}
                  rows={3}
                  className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm focus:outline-none resize-none"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-mono text-[10px] uppercase tracking-wider text-[#534434]">Frequency</label>
                <select
                  value={popupFrequency}
                  onChange={(e) => setPopupFrequency(e.target.value as any)}
                  disabled={isFieldDisabled}
                  className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm text-[#1b1c17] focus:outline-none"
                >
                  <option value="every_visit">Every Visit</option>
                  <option value="once_per_session">Once Per Session</option>
                  <option value="once_per_day">Once Per Day</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="font-mono text-[10px] uppercase tracking-wider text-[#534434]">Start Date</label>
                  <input
                    type="date"
                    value={popupStartDate}
                    onChange={(e) => setPopupStartDate(e.target.value)}
                    disabled={isFieldDisabled}
                    className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm focus:outline-none font-mono"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="font-mono text-[10px] uppercase tracking-wider text-[#534434]">End Date</label>
                  <input
                    type="date"
                    value={popupEndDate}
                    onChange={(e) => setPopupEndDate(e.target.value)}
                    disabled={isFieldDisabled}
                    className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="font-mono text-[10px] uppercase tracking-wider text-[#534434]">Button Label</label>
                  <input
                    type="text"
                    value={popupCtaLabel}
                    onChange={(e) => setPopupCtaLabel(e.target.value)}
                    placeholder="e.g. Claim Offer"
                    disabled={isFieldDisabled}
                    className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="font-mono text-[10px] uppercase tracking-wider text-[#534434]">Redirect Link / URL</label>
                  <input
                    type="text"
                    value={popupCtaLink}
                    onChange={(e) => setPopupCtaLink(e.target.value)}
                    placeholder="e.g. /menu"
                    disabled={isFieldDisabled}
                    className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-mono text-[10px] uppercase tracking-wider text-[#534434]">Promo / Coupon Code (Optional)</label>
                <input
                  type="text"
                  value={popupPromoCode}
                  onChange={(e) => setPopupPromoCode(e.target.value)}
                  placeholder="e.g. WAFFLEFREE (Enables copy-on-click)"
                  disabled={isFieldDisabled}
                  className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm focus:outline-none uppercase font-mono tracking-wider"
                />
              </div>

            </div>
          </div>
        )}

        {/* Snapshot Save Panel */}
        <div className="bg-white border border-[#d8c3ad] rounded-3xl shadow-sm p-6 flex flex-col gap-5">
          <h3 className="font-serif italic text-lg text-[#1b1c17] border-b border-[#d8c3ad]/60 pb-2">💾 Storefront Snapshots</h3>
          <div className="flex flex-col gap-3">
            <label className="font-mono text-[10px] uppercase tracking-wider text-[#534434]">Snapshot Name / Label</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. Diwali Festival Theme 2026"
                value={snapshotLabel}
                onChange={(e) => setSnapshotLabel(e.target.value)}
                className="flex-1 bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm focus:outline-none"
              />
              <button
                type="button"
                onClick={handleSaveSnapshot}
                disabled={savingSnapshot || !snapshotLabel.trim()}
                className="bg-[#855300] text-white hover:bg-[#6b4200] disabled:bg-[#e0d8cf] disabled:text-[#534434]/30 px-5 rounded-xl font-mono text-xs uppercase tracking-widest font-bold flex items-center gap-1.5 transition-all shadow-md shrink-0"
              >
                {savingSnapshot ? <RefreshCw size={12} className="animate-spin" /> : "Save"}
              </button>
            </div>
          </div>
        </div>

        {/* Dynamic Seasonal Campaign Manager */}
        <div className="bg-white border border-[#d8c3ad] rounded-3xl shadow-sm p-6 flex flex-col gap-5">
          <div className="flex justify-between items-center border-b border-[#d8c3ad]/60 pb-3">
            <div>
              <h3 className="font-serif italic text-xl text-[#1b1c17]">📅 Dynamic Seasonal Campaign Manager</h3>
              <p className="text-[9px] font-mono text-[#534434]/40 uppercase tracking-wider mt-0.5">Edit dates, layouts, themes, discounts and featured items for seasonal events</p>
            </div>
            <button
              onClick={startAddEvent}
              className="bg-[#855300] text-white hover:bg-[#6b4200] px-4 py-2 rounded-xl font-mono text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md shrink-0"
            >
              + Add Campaign
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {calendarEvents.map((ev) => {
              const monthsList = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
              return (
                <div 
                  key={ev.id} 
                  className={`p-4 rounded-2xl border transition-all duration-300 ${
                    editingEvent?.id === ev.id 
                      ? 'bg-amber-50 border-[#855300]/40 shadow-lg shadow-amber-100/50' 
                      : 'bg-[#fbf9f1] border-[#d8c3ad] hover:border-[#855300]/30'
                  }`}
                >
                  <div className="flex justify-between items-start gap-3 mb-2">
                    <div>
                      <h4 className="font-serif italic font-bold text-[#1b1c17] text-base">{ev.eventName}</h4>
                      <p className="text-[10px] font-mono text-[#534434]/65 uppercase tracking-wider mt-0.5">
                        🗓️ {monthsList[ev.startMonth]} {ev.startDay} - {monthsList[ev.endMonth]} {ev.endDay}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => startEditEvent(ev)}
                      className="bg-amber-50 hover:bg-[#855300] text-[#855300] hover:text-white px-2.5 py-1.5 rounded-xl transition-all flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider font-bold shrink-0"
                    >
                      <Edit2 size={10} /> Edit Campaign
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-[#d8c3ad]/40">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[8px] font-mono text-[#534434]/40 uppercase">Theme</span>
                      <span className="text-2xs text-[#855300] uppercase font-mono truncate">{ev.active_theme}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[8px] font-mono text-[#534434]/40 uppercase">Layout</span>
                      <span className="text-2xs text-[#1b1c17] uppercase font-mono truncate">{ev.layout_mode || 'slider'}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[8px] font-mono text-[#534434]/40 uppercase">Discount</span>
                      <span className="text-2xs text-emerald-600 font-mono truncate">
                        {ev.automatic_discount ? `${ev.automatic_discount.discount_percent}% OFF` : 'None'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <AnimatePresence mode="wait">
            {isEditingEventOpen && editingEvent && (
              <motion.form
                key="event-edit-form"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                onSubmit={handleSaveEvent}
                className="flex flex-col gap-4 bg-[#fbf9f1] border border-amber-200 rounded-2xl p-5 mt-2"
              >
                <div className="flex justify-between items-center border-b border-[#d8c3ad]/40 pb-2">
                  <span className="font-mono text-xs text-[#855300] uppercase font-bold tracking-wider">
                    ✍️ Editing Campaign: {editingEvent.eventName}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingEventOpen(false);
                      setEditingEvent(null);
                    }}
                    className="text-[#534434]/60 hover:text-[#1b1c17]"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Campaign Name */}
                  <div className="flex flex-col gap-1.5">
                    <label className="font-mono text-[9px] uppercase tracking-wider text-[#534434]">Campaign Event Name *</label>
                    <input
                      type="text"
                      value={eventTitle}
                      onChange={(e) => setEventTitle(e.target.value)}
                      className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#855300]"
                      required
                    />
                  </div>

                  {/* Dynamic Theme selection */}
                  <div className="flex flex-col gap-1.5">
                    <label className="font-mono text-[9px] uppercase tracking-wider text-[#534434]">Active Campaign Theme</label>
                    <select
                      value={eventTheme}
                      onChange={(e) => setEventTheme(e.target.value as any)}
                      className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm text-[#1b1c17] focus:outline-none focus:border-[#855300] font-mono"
                    >
                      <option value="default">Default Amber Glow</option>
                      <option value="raining">Twilight Raining Teal</option>
                      <option value="exam">Studious Espresso Indigo</option>
                      <option value="fest">Gold-Leaf Festive Mesh</option>
                      <option value="night">Obsidian Midnight Purple</option>
                      <option value="valentines">Sweet Valentine's Pink</option>
                      <option value="scorching">Scorching Summer Orange</option>
                      <option value="custom">✨ Custom DIY Theme</option>
                    </select>
                  </div>

                  {/* Custom DIY Theme Colors */}
                  {eventTheme === "custom" && (
                    <div className="flex flex-col gap-1.5 md:col-span-2 bg-[#f5f4ec] border border-amber-200 rounded-xl p-4">
                      <span className="font-mono text-[9px] uppercase tracking-wider text-[#855300] mb-2 inline-block">✨ Custom Theme Colors</span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[8px] font-mono uppercase text-[#534434]/60">Custom Glowing Aurora Hex</label>
                          <div className="flex gap-2">
                            <input
                              type="color"
                              value={eventCustomAuroraColor}
                              onChange={(e) => setEventCustomAuroraColor(e.target.value)}
                              className="w-10 h-10 rounded-lg cursor-pointer bg-white border border-[#d8c3ad]"
                            />
                            <input
                              type="text"
                              value={eventCustomAuroraColor}
                              onChange={(e) => setEventCustomAuroraColor(e.target.value)}
                              placeholder="#f8bc51"
                              className="bg-white border border-[#d8c3ad] rounded-lg px-3 flex-1 text-sm font-mono focus:outline-none focus:border-[#855300]"
                            />
                          </div>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[8px] font-mono uppercase text-[#534434]/60">Custom Deep Background Hex</label>
                          <div className="flex gap-2">
                            <input
                              type="color"
                              value={eventCustomBgColor}
                              onChange={(e) => setEventCustomBgColor(e.target.value)}
                              className="w-10 h-10 rounded-lg cursor-pointer bg-white border border-[#d8c3ad]"
                            />
                            <input
                              type="text"
                              value={eventCustomBgColor}
                              onChange={(e) => setEventCustomBgColor(e.target.value)}
                              placeholder="#0A0604"
                              className="bg-white border border-[#d8c3ad] rounded-lg px-3 flex-1 text-sm font-mono focus:outline-none focus:border-[#855300]"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Campaign Schedule Dates */}
                  <div className="flex flex-col gap-1.5 md:col-span-2 bg-[#f5f4ec] border border-[#d8c3ad] rounded-xl p-4">
                    <span className="font-mono text-[9px] uppercase tracking-wider text-[#855300] mb-2 inline-block">Campaign Active Schedule</span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-[8px] font-mono uppercase text-[#534434]/40">Start Month</label>
                        <select
                          value={eventStartMonth}
                          onChange={(e) => setEventStartMonth(Number(e.target.value))}
                          className="bg-white border border-[#d8c3ad] rounded-lg px-2.5 py-1.5 text-xs font-mono text-[#1b1c17] focus:outline-none"
                        >
                          {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((m, idx) => (
                            <option key={idx} value={idx}>{m}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[8px] font-mono uppercase text-[#534434]/40">Start Day</label>
                        <input
                          type="number"
                          min={1}
                          max={31}
                          value={eventStartDay}
                          onChange={(e) => setEventStartDay(Number(e.target.value))}
                          className="bg-white border border-[#d8c3ad] rounded-lg px-2.5 py-1.5 text-xs font-mono text-[#1b1c17] focus:outline-none"
                          required
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[8px] font-mono uppercase text-[#534434]/40">End Month</label>
                        <select
                          value={eventEndMonth}
                          onChange={(e) => setEventEndMonth(Number(e.target.value))}
                          className="bg-white border border-[#d8c3ad] rounded-lg px-2.5 py-1.5 text-xs font-mono text-[#1b1c17] focus:outline-none"
                        >
                          {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((m, idx) => (
                            <option key={idx} value={idx}>{m}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[8px] font-mono uppercase text-[#534434]/40">End Day</label>
                        <input
                          type="number"
                          min={1}
                          max={31}
                          value={eventEndDay}
                          onChange={(e) => setEventEndDay(Number(e.target.value))}
                          className="bg-white border border-[#d8c3ad] rounded-lg px-2.5 py-1.5 text-xs font-mono text-[#1b1c17] focus:outline-none"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  {/* Headline & Subtitle */}
                  <div className="flex flex-col gap-1.5">
                    <label className="font-mono text-[9px] uppercase tracking-wider text-[#534434]">Storefront Headline</label>
                    <input
                      type="text"
                      value={eventHeadline}
                      onChange={(e) => setEventHeadline(e.target.value)}
                      className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#855300]"
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="font-mono text-[9px] uppercase tracking-wider text-[#534434]">Storefront Subtitle</label>
                    <input
                      type="text"
                      value={eventSubText}
                      onChange={(e) => setEventSubText(e.target.value)}
                      className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#855300]"
                      required
                    />
                  </div>

                  {/* Layout Mode selection */}
                  <div className="flex flex-col gap-1.5">
                    <label className="font-mono text-[9px] uppercase tracking-wider text-[#534434]">Storefront Hero Layout Mode</label>
                    <select
                      value={eventLayoutMode}
                      onChange={(e) => setEventLayoutMode(e.target.value as any)}
                      className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm text-[#1b1c17] focus:outline-none focus:border-[#855300] font-mono"
                    >
                      <option value="slider">Platter Slider (Default)</option>
                      <option value="grid_board">Campaign Grid Board (Blinkit Grid)</option>
                      <option value="premium_salad">Premium Salad Hero (Stitch)</option>
                    </select>
                  </div>

                  {/* Auto Scroll Toggle */}
                  <div className="flex flex-col gap-1.5 md:col-span-2">
                    <div className="flex items-center justify-between p-3 bg-[#f5f4ec] border border-[#d8c3ad] rounded-xl">
                      <div>
                        <p className="text-sm font-semibold text-[#1b1c17] font-serif italic">Auto Horizontal Scroll</p>
                        <p className="text-[10px] text-[#534434] font-mono uppercase tracking-widest mt-0.5">Automatically cycles through items</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={eventAutoScrollEnabled}
                          onChange={(e) => setEventAutoScrollEnabled(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-[#e0d8cf] rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#d4c4b0] peer-checked:after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#855300]"></div>
                      </label>
                    </div>
                    {eventAutoScrollEnabled && (
                      <div className="flex flex-col gap-1.5 mt-2">
                        <label className="font-mono text-[9px] uppercase tracking-wider text-[#534434]">Scroll Interval (ms)</label>
                        <input
                          type="number"
                          value={eventAutoScrollInterval}
                          onChange={(e) => setEventAutoScrollInterval(Number(e.target.value))}
                          className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2 text-sm text-[#1b1c17] focus:outline-none focus:border-[#855300] font-mono"
                          min="1000"
                          step="500"
                        />
                      </div>
                    )}
                  </div>

                  {/* Background graphic cover url */}
                  <div className="flex flex-col gap-1.5">
                    <label className="font-mono text-[9px] uppercase tracking-wider text-[#534434]">Background Campaign Cover URL</label>
                    <input
                      type="url"
                      value={eventBgImage}
                      onChange={(e) => setEventBgImage(e.target.value)}
                      placeholder="https://..."
                      className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#855300] font-mono"
                    />
                  </div>

                  {/* Discount percent and description */}
                  <div className="flex flex-col gap-1.5">
                    <label className="font-mono text-[9px] uppercase tracking-wider text-[#534434]">Automatic Discount (%)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={eventDiscountPercent}
                      onChange={(e) => setEventDiscountPercent(Number(e.target.value))}
                      className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#855300] font-mono"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="font-mono text-[9px] uppercase tracking-wider text-[#534434]">Discount Description</label>
                    <input
                      type="text"
                      value={eventDiscountDesc}
                      onChange={(e) => setEventDiscountDesc(e.target.value)}
                      placeholder="e.g. Monsoon Cozy Rain Offer"
                      className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#855300]"
                    />
                  </div>

                  {/* Banner Active toggle & Text */}
                  <div className="flex flex-col gap-1.5 md:col-span-2 border-t border-[#d8c3ad]/40 pt-3.5 mt-1.5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-2xs uppercase tracking-wider text-[#534434] font-semibold">Active Operational Banner</span>
                      <input
                        type="checkbox"
                        checked={eventBannerActive}
                        onChange={(e) => setEventBannerActive(e.target.checked)}
                        className="accent-[#855300] w-4 h-4 cursor-pointer"
                      />
                    </div>
                    {eventBannerActive && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-2 flex flex-col gap-1">
                          <label className="text-[8px] font-mono uppercase text-[#534434]/40">Banner Message Text</label>
                          <input
                            type="text"
                            value={eventBannerText}
                            onChange={(e) => setEventBannerText(e.target.value)}
                            className="bg-white border border-[#d8c3ad] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#855300]"
                            required
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[8px] font-mono uppercase text-[#534434]/40">Banner Color</label>
                          <select
                            value={eventBannerColor}
                            onChange={(e) => setEventBannerColor(e.target.value as any)}
                            className="bg-white border border-[#d8c3ad] rounded-lg px-2.5 py-1.5 text-xs font-mono text-[#1b1c17] focus:outline-none"
                          >
                            <option value="golden">Golden Accents</option>
                            <option value="urgent">Urgent Coral Red</option>
                            <option value="success">Success Mint Green</option>
                            <option value="dark">Basalt Obsidian</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Featured Items Multiselect Capsules */}
                  <div className="flex flex-col gap-1.5 md:col-span-2 border-t border-[#d8c3ad]/40 pt-3.5 mt-1.5">
                    <label className="font-mono text-[9px] uppercase tracking-wider text-[#534434] mb-1 block">Featured Campaign Menu Items</label>
                    <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-2 bg-[#f5f4ec] border border-[#d8c3ad] rounded-xl custom-scrollbar">
                      {menuItems.map((item) => {
                        const isFeatured = eventFeaturedItemIds.includes(item.item_id);
                        return (
                          <button
                            type="button"
                            key={item.item_id}
                            onClick={() => {
                              if (isFeatured) {
                                setEventFeaturedItemIds(eventFeaturedItemIds.filter(id => id !== item.item_id));
                              } else {
                                setEventFeaturedItemIds([...eventFeaturedItemIds, item.item_id]);
                              }
                            }}
                            className="px-3 py-1.5 rounded-full font-mono text-2xs uppercase tracking-wider border transition-all bg-[#fbf9f1] border-[#d8c3ad] text-[#534434]/70 hover:border-[#855300]/40"
                          >
                            {item.name} ({item.category})
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Advanced Particle Overrides */}
                  <div className="flex flex-col gap-1.5 md:col-span-2 border-t border-[#d8c3ad]/40 pt-3.5 mt-1.5">
                    <label className="font-mono text-[9px] uppercase tracking-wider text-[#534434] mb-1 block">Advanced Floating Animation Overrides</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-[8px] font-mono uppercase text-[#534434]/40">Custom Falling Emojis (Comma Separated)</label>
                        <input
                          type="text"
                          value={eventCustomParticles}
                          onChange={(e) => setEventCustomParticles(e.target.value)}
                          placeholder="e.g. 🌹,🌸,🎇,🔔"
                          className="bg-white border border-[#d8c3ad] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#855300]"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[8px] font-mono uppercase text-[#534434]/40">Particle Count (Density)</label>
                        <input
                          type="number"
                          value={eventParticleCount}
                          onChange={(e) => setEventParticleCount(Number(e.target.value))}
                          placeholder="Default 15"
                          className="bg-white border border-[#d8c3ad] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#855300]"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[8px] font-mono uppercase text-[#534434]/40">Base Size (Scale Factor)</label>
                        <input
                          type="number"
                          value={eventParticleSize}
                          onChange={(e) => setEventParticleSize(Number(e.target.value))}
                          placeholder="Default 10"
                          className="bg-white border border-[#d8c3ad] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#855300]"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[8px] font-mono uppercase text-[#534434]/40">Base Speed (Duration in Secs)</label>
                        <input
                          type="number"
                          value={eventParticleSpeed}
                          onChange={(e) => setEventParticleSpeed(Number(e.target.value))}
                          placeholder="Default 10"
                          className="bg-white border border-[#d8c3ad] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#855300]"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[8px] font-mono uppercase text-[#534434]/40">Base Rotation (Degrees)</label>
                        <input
                          type="number"
                          value={eventParticleRotation}
                          onChange={(e) => setEventParticleRotation(Number(e.target.value))}
                          placeholder="Default 360"
                          className="bg-white border border-[#d8c3ad] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#855300]"
                        />
                      </div>
                    </div>
                  </div>

                </div>

                <div className="flex justify-between items-center pt-3 border-t border-[#d8c3ad]/40 mt-2">
                  <button
                    type="button"
                    onClick={() => handleDeleteEvent(editingEvent.id)}
                    className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 px-3 py-2 rounded-xl font-mono text-[10px] uppercase tracking-wider transition-colors"
                  >
                    Delete Campaign
                  </button>
                  
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingEventOpen(false);
                        setEditingEvent(null);
                      }}
                      className="bg-[#e0d8cf]/40 hover:bg-[#e0d8cf]/80 border border-[#d8c3ad] text-[#534434] px-4 py-2 rounded-xl font-mono text-[10px] uppercase tracking-wider transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="bg-[#855300] text-white hover:bg-[#6b4200] px-5 py-2 rounded-xl font-mono text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md"
                    >
                      <Save size={12} /> Save Campaign
                    </button>
                  </div>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </div>

        {/* Campaign Grid Board CMS Manager */}
        <div className="bg-white border border-[#d8c3ad] rounded-3xl shadow-sm p-6 flex flex-col gap-5">

          <div className="flex justify-between items-center border-b border-[#d8c3ad]/60 pb-3">
            <div>
              <h3 className="font-serif italic text-xl text-[#1b1c17]">Campaign Grid Board CMS</h3>
              <p className="text-[9px] font-mono text-[#534434]/40 uppercase tracking-wider mt-0.5">Manage grid promotional cards, banner ribbons and badges</p>
            </div>
            {!isAddingGridCard && !editingGridCard && (
              <button
                type="button"
                onClick={startAddNewGridCard}
                className="bg-[#855300] text-white hover:bg-[#6b4200] px-4 py-2 rounded-xl font-mono text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 transition-all"
              >
                <Plus size={12} /> Add Grid Card
              </button>
            )}
          </div>

          {_effectiveLayoutMode !== "grid_board" && (
            <div className="bg-amber-50/50 border border-[#855300]/10 rounded-xl p-3 text-[10px] text-[#855300]/70 leading-relaxed font-mono">
              ⚠️ Note: Storefront Hero Layout Mode is currently set to <strong>"{_effectiveLayoutMode}"</strong>. To display this Grid Board, switch Layout Mode to <strong>"Campaign Grid Board"</strong> above or adjust the mock date to an active grid board campaign.
            </div>
          )}

          {/* Grid Board Global Settings */}
          {!isAddingGridCard && !editingGridCard && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-[#d8c3ad]/40 pb-4 mb-2">
              <div className="flex flex-col gap-1.5">
                <label className="font-mono text-[9px] uppercase tracking-wider text-[#534434]">Grid Board Title</label>
                <input
                  type="text"
                  placeholder="e.g. Featured Specials"
                  value={autoCalendarMode && calendarEvent && !forceManualOverride ? calendarEvent.grid_board_title : gridBoardTitle}
                  onChange={(e) => setGridBoardTitle(e.target.value)}
                  disabled={isFieldDisabled}
                  className="bg-white border border-[#d8c3ad] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#855300] transition-colors disabled:opacity-40"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="font-mono text-[9px] uppercase tracking-wider text-[#534434]">Badge / Toggle Text</label>
                <input
                  type="text"
                  placeholder="e.g. SINGLE MODE"
                  value={autoCalendarMode && calendarEvent && !forceManualOverride ? calendarEvent.grid_board_badge_text : gridBoardBadgeText}
                  onChange={(e) => setGridBoardBadgeText(e.target.value)}
                  disabled={isFieldDisabled}
                  className="bg-white border border-[#d8c3ad] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#855300] transition-colors disabled:opacity-40"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="font-mono text-[9px] uppercase tracking-wider text-[#534434]">Ribbon Ticker Text</label>
                <input
                  type="text"
                  placeholder="e.g. LONG DISTANCE IS NO EXCUSE 💝"
                  value={autoCalendarMode && calendarEvent && !forceManualOverride ? calendarEvent.grid_board_ribbon_text : gridBoardRibbonText}
                  onChange={(e) => setGridBoardRibbonText(e.target.value)}
                  disabled={isFieldDisabled}
                  className="bg-white border border-[#d8c3ad] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#855300] transition-colors disabled:opacity-40"
                />
              </div>
            </div>
          )}

          <AnimatePresence mode="wait">
            {(isAddingGridCard || editingGridCard) ? (
              <motion.form
                key="grid-card-form"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                onSubmit={handleSaveGridCard}
                className="flex flex-col gap-4 bg-[#fbf9f1] border border-[#d8c3ad] rounded-2xl p-5"
              >
                <div className="flex justify-between items-center border-b border-[#d8c3ad]/40 pb-2">
                  <span className="font-mono text-xs text-[#855300] uppercase font-bold tracking-wider">
                    {editingGridCard ? "Edit Grid Card Tile" : "Add New Grid Card Tile"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingGridCard(false);
                      setEditingGridCard(null);
                    }}
                    className="text-[#534434]/60 hover:text-[#855300]"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="font-mono text-[9px] uppercase tracking-wider text-[#534434]">Grid Item Title *</label>
                    <input type="text" value={cardTitle} onChange={(e) => setCardTitle(e.target.value)} required className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="font-mono text-[9px] uppercase tracking-wider text-[#534434]">Grid Item Subtitle</label>
                    <input type="text" value={cardSubtitle} onChange={(e) => setCardSubtitle(e.target.value)} className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="font-mono text-[9px] uppercase tracking-wider text-[#534434]">Price Ticker Text (e.g. @ ₹180)</label>
                    <input type="text" value={cardPriceText} onChange={(e) => setCardPriceText(e.target.value)} className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm" />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="font-mono text-[9px] uppercase tracking-wider text-[#534434]">Tile Image URL *</label>
                    <div className="flex gap-2">
                      <input type="url" value={cardImageUrl} onChange={(e) => setCardImageUrl(e.target.value)} required className="flex-1 bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm" />
                      <button
                        type="button"
                        onClick={() => {
                          setImageTab("grid_card");
                          const el = document.getElementById("media-hub-uploader");
                          el?.scrollIntoView({ behavior: "smooth" });
                        }}
                        className="bg-[#e0d8cf]/40 hover:bg-[#e0d8cf]/80 px-4 rounded-xl border border-[#d8c3ad] text-[10px] font-mono uppercase tracking-wider"
                      >
                        Hub
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="font-mono text-[9px] uppercase tracking-wider text-[#534434]">Promo Target Link Type *</label>
                    <select value={cardRedirectType} onChange={(e) => setCardRedirectType(e.target.value as any)} className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm">
                      <option value="category">Category Segment Scroll</option>
                      <option value="item">Detailed Menu Item Checkout</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="font-mono text-[9px] uppercase tracking-wider text-[#534434]">{cardRedirectType === "category" ? "Target Category Category Name *" : "Target Menu Item ID *"}</label>
                    <input type="text" value={cardRedirectValue} onChange={(e) => setCardRedirectValue(e.target.value)} required placeholder={cardRedirectType === "category" ? "e.g. Biryani" : "e.g. item_id_here"} className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm font-mono" />
                  </div>

                  <div className="flex flex-col gap-1.5 md:col-span-2">
                    <label className="font-mono text-[9px] uppercase tracking-wider text-[#534434]">Graphic Blend Mode</label>
                    <select value={cardBlendMode} onChange={(e) => setCardBlendMode(e.target.value as any)} className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm text-[#1b1c17]">
                      <option value="normal">Normal (Transparent PNG)</option>
                      <option value="screen">Screen (Black Background)</option>
                      <option value="multiply">Multiply (White Background)</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-3 border-t border-[#d8c3ad]/40">
                  {editingGridCard && (
                    <button type="button" onClick={() => handleDeleteGridCard(editingGridCard.id)} className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 px-3 py-2 rounded-xl font-mono text-[10px] uppercase font-bold">Delete Card</button>
                  )}
                  <div className="flex gap-3 ml-auto">
                    <button type="button" onClick={() => { setIsAddingGridCard(false); setEditingGridCard(null); }} className="px-4 py-2 rounded-xl text-[10px] uppercase border border-[#d8c3ad]">Cancel</button>
                    <button type="submit" className="bg-[#855300] text-white px-5 py-2 rounded-xl font-bold text-[10px] uppercase">{editingGridCard ? "Update Card" : "Save Card"}</button>
                  </div>
                </div>
              </motion.form>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
                {effectiveGridCards.map((card) => (
                  <div key={card.id} className="p-3 bg-[#fbf9f1] border border-[#d8c3ad] rounded-xl flex items-center justify-between gap-3 relative group">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white border border-[#d8c3ad] rounded overflow-hidden flex items-center justify-center shrink-0">
                        {card.image_url ? (
                          <img src={card.image_url} alt={card.title} className="max-h-full max-w-full object-contain" style={{ mixBlendMode: card.blendMode || "normal" }} />
                        ) : (
                          <ImageIcon size={14} className="text-[#534434]/20" />
                        )}
                      </div>
                      <div className="text-left">
                        <span className="text-[11px] font-bold text-[#1b1c17] truncate max-w-[120px] block">{card.title}</span>
                        <span className="text-[8px] font-mono text-[#534434]/60 uppercase tracking-wide">{card.redirect_type}: {card.redirect_value}</span>
                      </div>
                    </div>
                    <button type="button" onClick={() => startEditGridCard(card)} className="opacity-0 group-hover:opacity-100 transition-opacity bg-amber-50 text-[#855300] border border-amber-100 p-1.5 rounded-lg">
                      <Edit2 size={10} />
                    </button>
                  </div>
                ))}
                {effectiveGridCards.length === 0 && (
                  <div className="col-span-2 py-6 text-center text-xs text-[#534434]/30 border border-dashed border-[#d8c3ad] rounded-2xl bg-[#fbf9f1]">
                    No promotional grid cards configured.
                  </div>
                )}
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Hero Carousel Slides CMS */}
        <div className="bg-white border border-[#d8c3ad] rounded-3xl shadow-sm p-6 flex flex-col gap-5">
          <div className="flex justify-between items-center border-b border-[#d8c3ad]/60 pb-3">
            <div>
              <h3 className="font-serif italic text-xl text-[#1b1c17]">Hero Carousel Slides CMS</h3>
              <p className="text-[9px] font-mono text-[#534434]/40 uppercase tracking-wider mt-0.5">Manage premium customer landing scroller items</p>
            </div>
            {!isAddingNew && !editingSlide && (
              <button
                onClick={startAddNewSlide}
                className="bg-[#855300] text-white hover:bg-[#6b4200] px-4 py-2 rounded-xl font-mono text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 transition-all"
              >
                <Plus size={12} /> Add New Slide
              </button>
            )}
          </div>

          <AnimatePresence mode="wait">
            {(isAddingNew || editingSlide) ? (
              <motion.form
                key="slide-form"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                onSubmit={handleSaveSlide}
                className="flex flex-col gap-4 bg-[#fbf9f1] border border-[#d8c3ad] rounded-2xl p-5"
              >
                <div className="flex justify-between items-center border-b border-[#d8c3ad]/40 pb-2">
                  <span className="font-mono text-xs text-[#855300] uppercase font-bold tracking-wider">
                    {generatingSlideAI ? (
                      <span className="flex items-center gap-1.5 text-[#855300] animate-pulse">
                        <Sparkles size={12} className="animate-spin" style={{ animationDuration: "3s" }} />
                        Ilara Cafe AI is crafting slide details...
                      </span>
                    ) : (
                      editingSlide ? "Editing Slide parameters" : "New Slide parameters"
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingNew(false);
                      setEditingSlide(null);
                    }}
                    className="text-[#534434]/60 hover:text-[#855300]"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="font-mono text-[9px] uppercase tracking-wider text-[#534434]">Link Menu Item *</label>
                    <div className="flex gap-2">
                      <select
                        value={slideMenuItemId}
                        onChange={(e) => handleSelectMenuItemForSlide(e.target.value)}
                        className="flex-1 bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm text-[#1b1c17] focus:outline-none focus:border-[#855300] font-mono"
                      >
                        <option value="">-- Choose Item --</option>
                        {menuItems.map((item) => (
                          <option key={item.item_id} value={item.item_id}>
                            {item.name} (₹{item.price})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={handleGenerateAIDetails}
                        disabled={generatingSlideAI || !slideMenuItemId}
                        className="bg-amber-50 border border-[#855300]/25 hover:border-[#855300]/40 hover:bg-[#855300]/20 text-[#855300] disabled:opacity-30 disabled:pointer-events-none rounded-xl px-4 flex items-center justify-center gap-1.5 transition-all text-[10px] font-mono tracking-widest uppercase font-bold shrink-0 active:scale-95 shadow-inner"
                      >
                        {generatingSlideAI ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} className="text-[#855300] animate-pulse" />}
                        <span>AI Craft</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="font-mono text-[9px] uppercase tracking-wider text-[#534434]">Category Tagline</label>
                    <input type="text" placeholder="e.g. AROMATIC BASMATI EXCELLENCE" value={slideTag} onChange={(e) => setSlideTag(e.target.value)} className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#855300]" />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="font-mono text-[9px] uppercase tracking-wider text-[#534434]">Title Line 1</label>
                    <input type="text" placeholder="e.g. Nizami Canopy" value={slideLine1} onChange={(e) => setSlideLine1(e.target.value)} className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#855300]" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="font-mono text-[9px] uppercase tracking-wider text-[#534434]">Title Line 2 (Accentuated)</label>
                    <input type="text" placeholder="e.g. Biryani" value={slideLine2} onChange={(e) => setSlideLine2(e.target.value)} className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#855300]" />
                  </div>

                  <div className="flex flex-col gap-1.5 md:col-span-2">
                    <label className="font-mono text-[9px] uppercase tracking-wider text-[#534434]">Slide Description Text *</label>
                    <textarea value={slideDesc} onChange={(e) => setSlideDesc(e.target.value)} required rows={3} className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#855300] resize-none" />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="font-mono text-[9px] uppercase tracking-wider text-[#534434]">Slide Image URL *</label>
                    <div className="flex gap-2">
                      <input type="url" value={slideImageUrl} onChange={(e) => setSlideImageUrl(e.target.value)} required className="flex-1 bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm" />
                      <button
                        type="button"
                        onClick={() => {
                          setImageTab("slide");
                          const el = document.getElementById("media-hub-uploader");
                          el?.scrollIntoView({ behavior: "smooth" });
                        }}
                        className="bg-[#e0d8cf]/40 hover:bg-[#e0d8cf]/80 px-4 rounded-xl border border-[#d8c3ad] text-[10px] font-mono uppercase tracking-wider"
                      >
                        Hub
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="font-mono text-[9px] uppercase tracking-wider text-[#534434]">Image Blend Mode</label>
                    <select value={slideBlendMode} onChange={(e) => setSlideBlendMode(e.target.value as any)} className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm text-[#1b1c17]">
                      <option value="normal">Normal (Transparent PNG)</option>
                      <option value="screen">Screen (Black Background)</option>
                      <option value="multiply">Multiply (White Background)</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="font-mono text-[9px] uppercase tracking-wider text-[#534434]">Special Price (₹) *</label>
                    <input type="number" value={slidePrice} onChange={(e) => setSlidePrice(Number(e.target.value))} required className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm font-mono" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="font-mono text-[9px] uppercase tracking-wider text-[#534434]">Wait Time (mins) *</label>
                    <input type="number" value={slideTime} onChange={(e) => setSlideTime(Number(e.target.value))} required className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm font-mono" />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="font-mono text-[9px] uppercase tracking-wider text-[#534434]">Highlights / Ingredients (Comma-separated)</label>
                    <input type="text" placeholder="e.g. Saffron Rice, Roasted Nuts" value={slideTagsText} onChange={(e) => setSlideTagsText(e.target.value)} className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm" />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="font-mono text-[9px] uppercase tracking-wider text-[#534434]">Sort Order Position</label>
                    <input type="number" value={slideSortOrder} onChange={(e) => setSlideSortOrder(Number(e.target.value))} className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm font-mono" />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="font-mono text-[8px] uppercase tracking-wider text-[#534434]">Accent Color Hex</label>
                    <div className="flex gap-2">
                      <input type="color" value={slideAccentColor} onChange={(e) => setSlideAccentColor(e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer bg-white border border-[#d8c3ad]" />
                      <input type="text" value={slideAccentColor} onChange={(e) => setSlideAccentColor(e.target.value)} placeholder="#f8bc51" className="bg-white border border-[#d8c3ad] rounded-lg px-3 flex-1 text-sm font-mono focus:outline-none" />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="font-mono text-[8px] uppercase tracking-wider text-[#534434]">Radial Background CSS *</label>
                    <input type="text" placeholder="radial-gradient(...)" value={slideBgColor} onChange={(e) => setSlideBgColor(e.target.value)} required className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2.5 text-sm font-mono" />
                  </div>
                </div>

                <div className="flex justify-between items-center pt-3 border-t border-[#d8c3ad]/40">
                  {editingSlide && (
                    <button type="button" onClick={() => handleDeleteSlide(editingSlide.id)} className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 px-3 py-2 rounded-xl font-mono text-[10px] uppercase font-bold flex items-center gap-1.5"><Trash2 size={12} /> Delete Slide</button>
                  )}
                  <div className="flex gap-3 ml-auto">
                    <button type="button" onClick={() => { setIsAddingNew(false); setEditingSlide(null); }} className="px-4 py-2 rounded-xl text-[10px] uppercase border border-[#d8c3ad]">Cancel</button>
                    <button type="submit" className="bg-[#855300] text-white px-5 py-2 rounded-xl font-bold text-[10px] uppercase">{editingSlide ? "Update Slide" : "Create Slide"}</button>
                  </div>
                </div>
              </motion.form>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-1">
                {sliderItems.map((slide) => (
                  <div key={slide.id} className="p-3 bg-[#fbf9f1] border border-[#d8c3ad] rounded-xl flex items-center justify-between gap-3 relative group">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white border border-[#d8c3ad] rounded overflow-hidden flex items-center justify-center shrink-0">
                        {slide.image_url ? (
                          <img src={slide.image_url} alt={slide.line1} className="max-h-full max-w-full object-contain" style={{ mixBlendMode: slide.blendMode || "normal" }} />
                        ) : (
                          <ImageIcon size={14} className="text-[#534434]/20" />
                        )}
                      </div>
                      <div className="text-left">
                        <span className="text-[11px] font-bold text-[#1b1c17] truncate max-w-[120px] block">{slide.line1} {slide.line2}</span>
                        <span className="text-[8px] font-mono text-[#534434]/60 uppercase tracking-wide">₹{slide.price} · Wait {slide.time}m</span>
                      </div>
                    </div>
                    <button type="button" onClick={() => startEditSlide(slide)} className="opacity-0 group-hover:opacity-100 transition-opacity bg-amber-50 text-[#855300] border border-amber-100 p-1.5 rounded-lg">
                      <Edit2 size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Premium Salad Hero CMS */}
        <div className="bg-white border border-[#d8c3ad] rounded-3xl shadow-sm p-6 flex flex-col gap-5">
          <h3 className="font-serif italic text-xl text-[#1b1c17] border-b border-[#d8c3ad]/60 pb-2">Premium Salad Hero CMS</h3>
          {_effectiveLayoutMode !== "premium_salad" && (
            <div className="bg-amber-50/50 border border-[#855300]/10 rounded-xl p-3 text-[10px] text-[#855300]/70 leading-relaxed font-mono">
              ⚠️ Note: Storefront Hero Layout Mode is currently set to <strong>"{_effectiveLayoutMode}"</strong>. To display this Premium Salad Hero, switch Layout Mode to <strong>"Premium Salad Hero"</strong> above.
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="font-mono text-[9px] uppercase tracking-wider text-[#534434]">Background Salad Gradient CSS</label>
              <input type="text" value={saladBgGradient} onChange={(e) => setSaladBgGradient(e.target.value)} className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2 text-xs font-mono" />
            </div>

            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="font-mono text-[9px] uppercase tracking-wider text-[#534434]">Ingredients Sprite URL (Quadrant Clockwise Rotation)</label>
              <div className="flex gap-2">
                <input type="url" value={saladIngredientsSprite} onChange={(e) => setSaladIngredientsSprite(e.target.value)} className="flex-1 bg-white border border-[#d8c3ad] rounded-xl px-4 py-2 text-xs font-mono" />
                <button
                  type="button"
                  onClick={() => {
                    setImageTab("salad_sprite");
                    const el = document.getElementById("media-hub-uploader");
                    el?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="bg-[#e0d8cf]/40 hover:bg-[#e0d8cf]/80 px-4 rounded-xl border border-[#d8c3ad] text-[10px] font-mono uppercase tracking-wider"
                >
                  Hub
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[9px] uppercase tracking-wider text-[#534434]">Quadrant 1 (Top-Left Ingredient Name)</label>
              <input type="text" value={saladItem1Name} onChange={(e) => setSaladItem1Name(e.target.value)} className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2 text-xs" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[9px] uppercase tracking-wider text-[#534434]">Quadrant 2 (Top-Right Ingredient Name)</label>
              <input type="text" value={saladItem2Name} onChange={(e) => setSaladItem2Name(e.target.value)} className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2 text-xs" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[9px] uppercase tracking-wider text-[#534434]">Quadrant 3 (Bottom-Right Ingredient Name)</label>
              <input type="text" value={saladItem3Name} onChange={(e) => setSaladItem3Name(e.target.value)} className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2 text-xs" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[9px] uppercase tracking-wider text-[#534434]">Quadrant 4 (Bottom-Left Ingredient Name)</label>
              <input type="text" value={saladItem4Name} onChange={(e) => setSaladItem4Name(e.target.value)} className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2 text-xs" />
            </div>
          </div>
        </div>

        {/* Dynamic Summer Campaign CMS */}
        <div className="bg-white border border-[#d8c3ad] rounded-3xl shadow-sm p-6 flex flex-col gap-5">
          <h3 className="font-serif italic text-xl text-[#1b1c17] border-b border-[#d8c3ad]/60 pb-2">Dynamic Summer Campaign CMS</h3>
          {_effectiveLayoutMode !== "summer_sips" && (
            <div className="bg-amber-50/50 border border-[#855300]/10 rounded-xl p-3 text-[10px] text-[#855300]/70 leading-relaxed font-mono">
              ⚠️ Note: Storefront Hero Layout Mode is currently set to <strong>"{_effectiveLayoutMode}"</strong>. To display this Summer Campaign, switch Layout Mode to <strong>"Summer Sips Hero"</strong> above.
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-b border-[#d8c3ad]/40 pb-4 mb-2">
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="font-mono text-[9px] uppercase tracking-wider text-[#534434]">Campaign Background Gradient CSS</label>
              <input type="text" value={summerBgGradient} onChange={(e) => setSummerBgGradient(e.target.value)} className="bg-white border border-[#d8c3ad] rounded-xl px-4 py-2 text-xs font-mono" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[9px] uppercase tracking-wider text-[#534434]">Hero Title</label>
              <input type="text" value={summerHeroTitle} onChange={(e) => setSummerHeroTitle(e.target.value)} className="bg-white border border-[#d8c3ad] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#855300] transition-colors" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[9px] uppercase tracking-wider text-[#534434]">Hero Subtitle</label>
              <input type="text" value={summerHeroSub} onChange={(e) => setSummerHeroSub(e.target.value)} className="bg-white border border-[#d8c3ad] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#855300] transition-colors" />
            </div>
          </div>
        </div>

        {/* Media Uploader Hub */}
        <div id="media-hub-uploader" className="bg-white border border-[#d8c3ad] rounded-3xl shadow-sm p-6 flex flex-col gap-5 scroll-mt-6">
          <div className="flex items-center gap-2 pb-2 border-b border-[#d8c3ad]/60">
            <ImageIcon size={18} className="text-[#855300]" />
            <h3 className="font-serif italic text-lg text-[#1b1c17]">Media Uploader Hub</h3>
          </div>

          <div className="grid grid-cols-4 gap-2 bg-[#f5f4ec] p-1 rounded-xl border border-[#d8c3ad]/50 font-mono text-[9px] uppercase tracking-wider">
            <button
              type="button"
              onClick={() => {
                setImageTab("storefront");
                setUploadFile(null);
                setUploadSuccess(false);
              }}
              className={`py-1.5 rounded-lg transition-all ${imageTab === "storefront" ? "bg-[#855300] text-white font-bold" : "text-[#534434] hover:text-white"}`}
            >
              Bg Cover
            </button>
            <button
              type="button"
              onClick={() => {
                setImageTab("slide");
                setUploadFile(null);
                setUploadSuccess(false);
              }}
              className={`py-1.5 rounded-lg transition-all ${imageTab === "slide" ? "bg-[#855300] text-white font-bold" : "text-[#534434] hover:text-white"}`}
            >
              Slide png
            </button>
            <button
              type="button"
              onClick={() => {
                setImageTab("grid_card");
                setUploadFile(null);
                setUploadSuccess(false);
              }}
              className={`py-1.5 rounded-lg transition-all ${imageTab === "grid_card" ? "bg-[#855300] text-white font-bold" : "text-[#534434] hover:text-white"}`}
            >
              Grid Tile
            </button>
            <button
              type="button"
              onClick={() => {
                setImageTab("salad_sprite");
                setUploadFile(null);
                setUploadSuccess(false);
              }}
              className={`py-1.5 px-1 rounded-lg transition-all ${imageTab === "salad_sprite" ? "bg-[#855300] text-white font-bold" : "text-[#534434] hover:text-white"}`}
            >
              Sprite
            </button>
          </div>

          <div className="flex flex-col gap-4">
            <form onSubmit={handleImageUpload} className="flex flex-col gap-4">
              <div className="relative group border-2 border-dashed border-[#d8c3ad] hover:border-[#855300] rounded-2xl p-6 cursor-pointer text-center bg-[#fbf9f1] min-h-[140px] flex items-center justify-center transition-all">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                {uploadFile ? (
                  <div className="flex flex-col items-center gap-1">
                    <CheckCircle className="text-[#10B981] w-8 h-8 animate-bounce" />
                    <p className="text-[#1b1c17] text-xs truncate max-w-[180px] font-semibold">{uploadFile.name}</p>
                    <p className="text-[9px] text-[#534434]/40 font-mono">{(uploadFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1.5">
                    <Upload className="text-[#534434] w-7 h-7 group-hover:text-[#855300] transition-colors" />
                    <div>
                      <p className="text-[#1b1c17] text-xs font-semibold">
                        {imageTab === "storefront" 
                          ? "Upload background cover" 
                          : imageTab === "slide" 
                            ? "Upload transparent PNG"
                            : imageTab === "grid_card"
                              ? "Upload Grid Promo Tile"
                              : "Upload Ingredients Sprite"}
                      </p>
                      <p className="text-[9px] text-[#534434]/50 mt-0.5 font-mono">Click or drag image here</p>
                    </div>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={!uploadFile || uploading}
                className="w-full bg-[#855300] text-white hover:bg-[#6b4200] disabled:bg-[#e0d8cf] disabled:text-[#534434]/30 rounded-xl py-3 font-mono font-bold text-xs uppercase tracking-widest transition-colors flex items-center justify-center gap-1.5 shadow-md"
              >
                {uploading ? (
                  <>
                    <RefreshCw size={12} className="animate-spin" />
                    Uploading to Firebase Storage...
                  </>
                ) : (
                  imageTab === "storefront" 
                    ? "Upload Background URL" 
                    : imageTab === "slide"
                      ? "Upload Slide Photo"
                      : imageTab === "grid_card"
                        ? "Upload Grid Tile Graphic"
                        : "Upload Salad Ingredients Sprite"
                )}
              </button>

              {uploadSuccess && (
                <div className="bg-[#10B981]/10 border border-[#10B981]/20 rounded-xl p-3 flex flex-col gap-1.5">
                  <span className="flex items-center gap-1.5 font-mono text-[9px] text-[#10B981] font-bold uppercase">
                    <CheckCircle size={10} />
                    Success!
                  </span>
                  <p className="text-[8px] text-[#534434]/60 font-mono leading-relaxed">
                    {imageTab === "storefront" 
                      ? 'Storefront Background registered. Click "Save storefront settings" on left to publish.'
                      : imageTab === "slide"
                        ? 'Slide image uploaded. Continue completing the slide details on the left and save.'
                        : imageTab === "grid_card"
                          ? 'Grid Tile image uploaded. Continue editing card details in the layout panel and save.'
                          : 'Salad ingredients sprite uploaded. Return to the Premium Salad Hero CMS to save.'}
                  </p>
                </div>
              )}
            </form>
          </div>
        </div>

      </div>

      {/* Live Preview Panel (Desktop / Mobile toggle with Iframe) */}
      <div className="bg-white border border-[#d8c3ad] rounded-3xl shadow-sm p-6 flex flex-col gap-4 relative overflow-hidden">
        <div className="flex items-center justify-between pb-2 border-b border-[#d8c3ad]/60">
          <div className="flex items-center gap-2">
            <Smartphone size={16} className="text-[#855300]" />
            <h3 className="font-serif italic text-lg text-[#1b1c17]">Live Storefront Preview</h3>
          </div>
          
          <div className="flex bg-[#f5f4ec] rounded-xl p-0.5 border border-[#d8c3ad]/50">
            <button
              type="button"
              onClick={() => setIframeDevice("mobile")}
              className={`p-1.5 rounded-lg text-xs font-semibold font-mono transition-all flex items-center gap-1 ${
                iframeDevice === "mobile" ? "bg-[#855300] text-white shadow-sm" : "text-[#534434] hover:text-[#855300]"
              }`}
              title="Mobile Viewport"
            >
              <Smartphone size={12} />
              <span>Mobile</span>
            </button>
            <button
              type="button"
              onClick={() => setIframeDevice("desktop")}
              className={`p-1.5 rounded-lg text-xs font-semibold font-mono transition-all flex items-center gap-1 ${
                iframeDevice === "desktop" ? "bg-[#855300] text-white shadow-sm" : "text-[#534434] hover:text-[#855300]"
              }`}
              title="Desktop Viewport"
            >
              <Monitor size={12} />
              <span>Desktop</span>
            </button>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-2 bg-[#f5f4ec] rounded-2xl min-h-[820px]">
          <div
            className={`relative bg-white shadow-2xl transition-all duration-300 border-[6px] border-[#221710] overflow-hidden ${
              iframeDevice === "mobile"
                ? "w-[375px] h-[760px] rounded-[36px] pt-6 pb-5"
                : "w-full h-[760px] rounded-xl"
            }`}
          >
            {iframeDevice === "mobile" && (
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-32 h-4 bg-[#221710] rounded-b-2xl z-40 flex items-center justify-between px-4">
                <div className="w-1 h-1 rounded-full bg-[#10b981]/40" />
                <div className="w-8 h-1 bg-[#101010] rounded-full" />
              </div>
            )}
            
            <iframe
              key={iframeReloadKey}
              src="/"
              className="w-full h-full border-none z-10"
              title="Storefront Preview"
            />
            
            {iframeDevice === "mobile" && (
              <div className="absolute bottom-1.5 left-1/2 transform -translate-x-1/2 w-24 h-1 bg-[#221710] rounded-full z-40" />
            )}
          </div>
        </div>
      </div>

    </div>
  );
}