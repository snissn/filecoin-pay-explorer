"use client";
import { Button } from "@filecoin-pay/ui/components/button";
import { Logo } from "@filecoin-pay/ui/components/logo";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@filecoin-pay/ui/components/navigation-menu";
import { Sheet, SheetContent, SheetTrigger } from "@filecoin-pay/ui/components/sheet";
import { ThemeToggle } from "@filecoin-pay/ui/components/theme-toggle";
import { cn } from "@filecoin-pay/ui/lib/utils";
import { Boxes, LayoutDashboard, Menu, Network, Shield, Users, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import NetworkIndicator from "./NetworkIndicator";

const navigationLinks = [
  { name: "Console", href: "/console", icon: LayoutDashboard, networkScoped: false },
  { name: "Services", href: "/services", icon: Boxes, networkScoped: true },
  { name: "Rails", href: "/rails", icon: Network, networkScoped: true },
  { name: "Accounts", href: "/accounts", icon: Users, networkScoped: true },
  { name: "Operators", href: "/operators", icon: Shield, networkScoped: true },
];

const NETWORK_PREFIX = /^\/(mainnet|calibration)(?=\/|$)/;

function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const networkPrefix = pathname?.match(NETWORK_PREFIX)?.[0] ?? "";
  const normalizedPathname = pathname?.replace(NETWORK_PREFIX, "") || "/";

  const resolveHref = (href: string, networkScoped: boolean) =>
    networkScoped && networkPrefix ? `${networkPrefix}${href}` : href;

  const isActiveLink = (href: string, networkScoped: boolean) => {
    const path = networkScoped ? normalizedPathname : pathname;
    return path === href || path?.startsWith(`${href}/`);
  };

  return (
    <header className='sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60'>
      <div className='max-w-screen-2xl mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8'>
        <Link href='/' className='inline-flex items-center gap-2 transition-opacity hover:opacity-80'>
          <Logo />
        </Link>

        <NavigationMenu className='hidden md:flex'>
          <NavigationMenuList>
            {navigationLinks.map((link) => {
              const Icon = link.icon;
              const isActive = isActiveLink(link.href, link.networkScoped);
              return (
                <NavigationMenuItem key={link.href}>
                  <NavigationMenuLink active={isActive} asChild>
                    <Link
                      href={resolveHref(link.href, link.networkScoped)}
                      className='flex-row items-center gap-2 transition-all duration-200'
                    >
                      <Icon className='h-4 w-4' />
                      {link.name}
                    </Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              );
            })}
          </NavigationMenuList>
        </NavigationMenu>

        <div className='flex items-center gap-3'>
          <NetworkIndicator />
          <ThemeToggle />

          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild className='md:hidden'>
              <Button variant='ghost' size='icon' aria-label='Toggle menu'>
                {isOpen ? <X className='h-5 w-5' /> : <Menu className='h-5 w-5' />}
              </Button>
            </SheetTrigger>
            <SheetContent side='right' className='w-72'>
              <nav className='flex flex-col gap-2 mt-12'>
                {navigationLinks.map((link) => {
                  const Icon = link.icon;
                  const isActive = isActiveLink(link.href, link.networkScoped);
                  return (
                    <Link
                      key={link.href}
                      href={resolveHref(link.href, link.networkScoped)}
                      onClick={() => setIsOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200",
                        "hover:bg-accent hover:text-accent-foreground",
                        isActive ? "bg-accent text-accent-foreground font-semibold" : "text-muted-foreground",
                      )}
                    >
                      <Icon className='h-5 w-5' />
                      {link.name}
                    </Link>
                  );
                })}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

export default Header;
