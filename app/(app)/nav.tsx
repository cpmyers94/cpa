"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Wallet,
  Receipt,
  ShoppingCart,
  CalendarDays,
  PiggyBank,
  CreditCard,
  TrendingDown,
  Users,
} from "lucide-react";

const links = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/paychecks", label: "Paychecks", icon: Wallet },
  { href: "/bills", label: "Bills", icon: Receipt },
  { href: "/expenses", label: "Expenses", icon: ShoppingCart },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/goals", label: "Goals", icon: PiggyBank },
  { href: "/debts", label: "Debts", icon: CreditCard },
  { href: "/plan", label: "Plan", icon: TrendingDown },
  { href: "/household", label: "Household", icon: Users },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-neutral-200 px-4 py-2 md:w-56 md:shrink-0 md:flex-col md:border-b-0 md:border-r md:px-3 md:py-6 dark:border-neutral-800">
      {links.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "text-neutral-600 hover:bg-neutral-200/60 dark:text-neutral-400 dark:hover:bg-neutral-800"
            }`}
          >
            <Icon size={16} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
