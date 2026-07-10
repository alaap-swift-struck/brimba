"use client"

// The profile menu — your name/email, a link to Account, and sign out. Extracted
// from the app shell so each stays small. Menu opacity is handled by the library
// dropdown now (UI-GAPS row 5).

import { useRouter } from "next/navigation"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@swift-struck/ui/registry/primitives/avatar/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@swift-struck/ui/registry/primitives/dropdown-menu/dropdown-menu"
import { LogOut, UserRound } from "lucide-react"

import { auth } from "@/lib/api"
import { personName, personInitials } from "@/lib/identity"
import { softNavigate } from "@/lib/nav"
import { clearAllFormDrafts } from "@/lib/use-form-draft"
import type { ActiveTeam } from "@/lib/use-active-team"

export function ProfileMenu({ active }: { active: ActiveTeam }) {
  const router = useRouter()
  const { user } = active
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="rounded-full outline-none ring-offset-2 focus-visible:ring-2">
          <Avatar className="size-8">
            {user?.imageUrl && <AvatarImage src={user.imageUrl} alt="You" />}
            <AvatarFallback className="text-xs">
              {personInitials(user?.firstName, user?.lastName)}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col">
          <span className="truncate">
            {personName({ firstName: user?.firstName, lastName: user?.lastName })}
          </span>
          <span className="text-muted-foreground truncate text-xs font-normal">
            {user?.email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => softNavigate("/settings")} className="gap-2">
          <UserRound className="size-4" />
          Account
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() =>
            void auth.logout().then(() => {
              clearAllFormDrafts() // one user's unsaved drafts never leak to the next
              router.replace("/login")
            })
          }
          className="gap-2"
        >
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
