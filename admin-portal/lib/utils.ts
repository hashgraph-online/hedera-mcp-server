import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combines multiple class names into a single string, handling conditional classes and merging Tailwind CSS classes intelligently
 * @param {...ClassValue[]} inputs - Array of class values that can be strings, objects, arrays, or other valid clsx inputs
 * @returns {string} A single string of merged and deduplicated class names
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}