'use client';
import { useUser } from '@auth0/nextjs-auth0/client';
import { Avatar, Dropdown, DropdownItem, DropdownSection, DropdownTrigger, DropdownMenu } from "@heroui/react";
import { useRouter } from 'next/navigation';

export function UserButton() {
    const router = useRouter();
    const { user } = useUser();
    if (!user) {
        return <></>;
    }

    const name = user.name ?? user.email ?? 'Неизвестный пользователь';

    return <Dropdown>
        <DropdownTrigger>
            <Avatar
                name={name}
                size="sm"
                className="cursor-pointer"
            />
        </DropdownTrigger>
        <DropdownMenu
            onAction={(key) => {
                if (key === 'logout') {
                    router.push('/api/auth/logout');
                }
            }}
        >
            <DropdownSection title={name}>
                <DropdownItem key="logout">
                    Выйти
                </DropdownItem>
            </DropdownSection>
        </DropdownMenu>
    </Dropdown>
}