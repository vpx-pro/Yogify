/**
 * Avatar Service for generating and managing instructor profile photos
 * Uses DiceBear API for consistent, professional avatars
 */

export interface AvatarOptions {
  seed: string;
  size?: number;
  backgroundColor?: string[];
  style?: 'avataaars' | 'big-smile' | 'bottts' | 'identicon' | 'initials' | 'personas';
}

export class AvatarService {
  private static readonly DEFAULT_SIZE = 200;
  private static readonly DEFAULT_STYLE = 'avataaars';
  private static readonly CACHE_PREFIX = 'avatar_cache_';
  
  /**
   * Generate a consistent avatar URL for a user
   * @param seed - Unique identifier (user ID or email)
   * @param options - Avatar customization options
   */
  static generateAvatarUrl(seed: string, options: Partial<AvatarOptions> = {}): string {
    const {
      size = this.DEFAULT_SIZE,
      style = this.DEFAULT_STYLE,
      backgroundColor = ['b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf']
    } = options;

    // Create a clean seed from the input
    const cleanSeed = this.sanitizeSeed(seed);
    
    // Build DiceBear API URL
    const baseUrl = 'https://api.dicebear.com/7.x';
    const params = new URLSearchParams({
      seed: cleanSeed,
      size: size.toString(),
      backgroundColor: backgroundColor.join(','),
      // Additional style-specific options for professional look
      ...(style === 'avataaars' && {
        accessories: 'round,prescription01,prescription02',
        accessoriesColor: '262e33,3e4c59,5d4e75',
        clothing: 'blazerShirt,blazerSweater,collarSweater,graphicShirt,hoodie,overall,shirtCrewNeck,shirtScoopNeck,shirtVNeck',
        clothingColor: '262e33,3e4c59,5d4e75,65c9ff,fc909f,fd9841,ffb238,9287ff',
        eyebrows: 'default,defaultNatural,flatNatural,raisedExcited,unibrowNatural',
        eyes: 'default,closed,cry,dizzy,eyeRoll,happy,hearts,side,squint,surprised,wink,winkWacky',
        facialHair: 'default,blank,beardMedium,beardLight,beardMajestic,moustacheFancy,moustacheMagnum',
        facialHairColor: '2c1b18,724133,a55728,b58143,c93305,d6b370,e6e6e6',
        hairColor: '2c1b18,724133,a55728,b58143,c93305,d6b370,e6e6e6',
        hatColor: '262e33,3e4c59,5d4e75,65c9ff,fc909f,fd9841,ffb238,9287ff',
        mouth: 'default,concerned,disbelief,eating,grimace,sad,screamOpen,serious,smile,tongue,twinkle,vomit',
        skinColor: 'tanned,yellow,pale,light,brown,darkBrown,black'
      })
    });

    return `${baseUrl}/${style}/svg?${params.toString()}`;
  }

  /**
   * Generate a fallback avatar using initials
   */
  static generateInitialsAvatar(name: string, size: number = this.DEFAULT_SIZE): string {
    const initials = this.extractInitials(name);
    const backgroundColor = this.getColorFromString(name);
    
    const params = new URLSearchParams({
      seed: initials,
      size: size.toString(),
      backgroundColor: backgroundColor,
      textColor: 'ffffff'
    });

    return `https://api.dicebear.com/7.x/initials/svg?${params.toString()}`;
  }

  /**
   * Get the best available avatar for a user
   * Priority: custom uploaded photo > generated avatar > initials fallback
   */
  static getAvatarUrl(
    userId: string, 
    fullName: string, 
    customAvatarUrl?: string | null,
    size: number = this.DEFAULT_SIZE
  ): string {
    // Use custom uploaded photo if available
    if (customAvatarUrl && this.isValidImageUrl(customAvatarUrl)) {
      return customAvatarUrl;
    }

    // Generate consistent avatar based on user ID
    try {
      return this.generateAvatarUrl(userId, { size });
    } catch (error) {
      console.warn('Failed to generate avatar, falling back to initials:', error);
      // Fallback to initials avatar
      return this.generateInitialsAvatar(fullName, size);
    }
  }

  /**
   * Preload avatar images for better performance
   */
  static async preloadAvatars(users: Array<{ id: string; full_name: string; avatar_url?: string | null }>): Promise<void> {
    const preloadPromises = users.map(user => {
      const avatarUrl = this.getAvatarUrl(user.id, user.full_name, user.avatar_url);
      return this.preloadImage(avatarUrl);
    });

    try {
      await Promise.allSettled(preloadPromises);
    } catch (error) {
      console.warn('Some avatars failed to preload:', error);
    }
  }

  /**
   * Cache avatar URLs in memory for session
   */
  private static avatarCache = new Map<string, string>();

  static getCachedAvatarUrl(
    userId: string, 
    fullName: string, 
    customAvatarUrl?: string | null,
    size: number = this.DEFAULT_SIZE
  ): string {
    const cacheKey = `${userId}_${size}_${customAvatarUrl || 'default'}`;
    
    if (this.avatarCache.has(cacheKey)) {
      return this.avatarCache.get(cacheKey)!;
    }

    const avatarUrl = this.getAvatarUrl(userId, fullName, customAvatarUrl, size);
    this.avatarCache.set(cacheKey, avatarUrl);
    
    return avatarUrl;
  }

  // Helper methods
  private static sanitizeSeed(seed: string): string {
    return seed.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'default';
  }

  private static extractInitials(name: string): string {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'YT'; // Default to 'YT' for Yoga Teacher
  }

  private static getColorFromString(str: string): string {
    const colors = [
      'C4896F', // Primary yoga theme color
      'B39CD0', // Soft purple
      '87CEEB', // Sky blue
      'DDA0DD', // Plum
      'F0E68C', // Khaki
      'FFB6C1', // Light pink
      '98FB98', // Pale green
      'F5DEB3', // Wheat
      'D3D3D3', // Light gray
      'FFA07A'  // Light salmon
    ];
    
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    return colors[Math.abs(hash) % colors.length];
  }

  private static isValidImageUrl(url: string): boolean {
    try {
      new URL(url);
      return /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url) || url.includes('dicebear.com');
    } catch {
      return false;
    }
  }

  private static preloadImage(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
      img.src = url;
      
      // Timeout after 5 seconds
      setTimeout(() => reject(new Error('Image load timeout')), 5000);
    });
  }

  /**
   * Generate multiple avatar variations for selection
   */
  static generateAvatarVariations(seed: string, count: number = 6): string[] {
    const styles: AvatarOptions['style'][] = ['avataaars', 'big-smile', 'personas'];
    const variations: string[] = [];

    for (let i = 0; i < count; i++) {
      const style = styles[i % styles.length];
      const variation = `${seed}_${i}`;
      variations.push(this.generateAvatarUrl(variation, { style }));
    }

    return variations;
  }
}

// Export default avatar configurations
export const AVATAR_SIZES = {
  SMALL: 32,
  MEDIUM: 60,
  LARGE: 120,
  EXTRA_LARGE: 200
} as const;

export const AVATAR_STYLES = {
  PROFESSIONAL: 'avataaars',
  FRIENDLY: 'big-smile',
  ARTISTIC: 'personas',
  MINIMAL: 'initials'
} as const;