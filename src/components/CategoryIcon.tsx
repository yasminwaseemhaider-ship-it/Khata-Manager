"use client";

import {
  ShoppingCart, UtensilsCrossed, Car, Zap, Fuel, Home, HeartPulse, ShoppingBag,
  Clapperboard, Receipt, GraduationCap, House, Wallet, Briefcase, Laptop, Gift,
  CirclePlus, Tag, Shirt, Baby, Dog, Plane, Bus, Train, Bike, Phone, Wifi,
  Droplets, Flame, Scissors, Dumbbell, Coffee, Pill, Stethoscope, BookOpen,
  Gamepad2, Music, Tv, CreditCard, Landmark, PiggyBank, TrendingUp, Hammer,
  Sparkles, Users, Cake, Cigarette, HandCoins, Banknote, Smartphone,
  type LucideIcon,
} from "lucide-react";

/**
 * Icon registry. Category rows store an icon *name*, so the set can grow
 * without a migration — an unknown name simply falls back.
 */
export const ICONS: Record<string, LucideIcon> = {
  ShoppingCart, UtensilsCrossed, Car, Zap, Fuel, Home, HeartPulse, ShoppingBag,
  Clapperboard, Receipt, GraduationCap, House, Wallet, Briefcase, Laptop, Gift,
  CirclePlus, Tag, Shirt, Baby, Dog, Plane, Bus, Train, Bike, Phone, Wifi,
  Droplets, Flame, Scissors, Dumbbell, Coffee, Pill, Stethoscope, BookOpen,
  Gamepad2, Music, Tv, CreditCard, Landmark, PiggyBank, TrendingUp, Hammer,
  Sparkles, Users, Cake, Cigarette, HandCoins, Banknote, Smartphone,
};

/** Names offered in the icon picker, in a sensible browsing order. */
export const ICON_NAMES = Object.keys(ICONS);

const FALLBACK: LucideIcon = Tag;

export function CategoryIcon({
  name,
  className,
}: {
  name?: string | null;
  className?: string;
}) {
  const Icon = (name && ICONS[name]) || FALLBACK;
  return <Icon className={className} aria-hidden="true" />;
}
