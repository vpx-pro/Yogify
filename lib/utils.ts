/**
 * Utility functions for the Yogify app
 */

/**
 * Get initials from a name (up to 2 characters)
 * @param name Full name to extract initials from
 * @returns String containing the initials
 */
export function getInitials(name: string): string {
  if (!name) return 'YT'; // Default for "Yoga Teacher"
  
  return name
    .split(' ')
    .map(part => part.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Format a date string to a more readable format
 * @param dateString ISO date string
 * @returns Formatted date string
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const classDate = date.toDateString();
  const todayDate = today.toDateString();
  const tomorrowDate = tomorrow.toDateString();

  if (classDate === todayDate) return 'Today';
  if (classDate === tomorrowDate) return 'Tomorrow';
  
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format a time string (HH:MM:SS) to a more readable format
 * @param timeString Time string in HH:MM:SS format
 * @returns Formatted time string
 */
export function formatTime(timeString: string): string {
  const [hours, minutes] = timeString.split(':');
  const date = new Date();
  date.setHours(parseInt(hours), parseInt(minutes));
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format a date range for retreats
 * @param startDate Start date string
 * @param endDate End date string
 * @returns Formatted date range string
 */
export function formatDateRange(startDate: string, endDate?: string): string {
  if (!endDate) return formatDate(startDate);
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
  const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
  const startDay = start.getDate();
  const endDay = end.getDate();
  const year = start.getFullYear();

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay} - ${endDay}, ${year}`;
  } else {
    return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
  }
}

/**
 * Get status color based on status type
 * @param status Status string
 * @returns Color hex code
 */
export function getStatusColor(status: string): string {
  switch (status) {
    case 'completed':
    case 'confirmed':
      return '#4CAF50'; // Green
    case 'pending':
      return '#FF9800'; // Orange
    case 'failed':
      return '#E74C3C'; // Red
    case 'refunded':
      return '#9C27B0'; // Purple
    case 'cancelled':
      return '#9E9E9E'; // Grey
    default:
      return '#666666'; // Dark grey
  }
}

/**
 * Calculate retreat duration in days
 * @param startDate Start date string
 * @param endDate End date string
 * @returns Duration in days
 */
export function getRetreatDuration(startDate: string, endDate?: string): number {
  if (!endDate) return 1;
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * Check if a class is in the past
 * @param dateString Date string
 * @param timeString Time string
 * @returns Boolean indicating if the class is in the past
 */
export function isClassPast(dateString: string, timeString: string): boolean {
  const classDateTime = new Date(`${dateString} ${timeString}`);
  return classDateTime < new Date();
}

/**
 * Check if early bird pricing is active
 * @param earlyBirdDeadline Early bird deadline date string
 * @returns Boolean indicating if early bird pricing is active
 */
export function isEarlyBirdActive(earlyBirdDeadline?: string): boolean {
  if (!earlyBirdDeadline) return false;
  return new Date(earlyBirdDeadline) >= new Date();
}

/**
 * Format a price with currency symbol
 * @param price Price number
 * @param currency Currency symbol
 * @returns Formatted price string
 */
export function formatPrice(price: number, currency: string = '€'): string {
  return `${currency}${price.toFixed(2)}`;
}