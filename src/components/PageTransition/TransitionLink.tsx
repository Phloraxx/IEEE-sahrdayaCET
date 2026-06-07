'use client';

import Link from 'next/link';

interface TransitionLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children: React.ReactNode;
}

export default function TransitionLink({ href, children, className, ...rest }: TransitionLinkProps) {
  return <Link href={href} className={className} {...rest}>{children}</Link>;
}
