export interface NavItem {
  label: string;
  href: string;
}

export interface Event {
  $id: string;
  $createdAt: string;
  $updatedAt: string;
  title: string;
  description?: string;
  date: string;
  venue?: string;
  price: number;
  banner_url?: string;
  society_id?: string;
  status: string;
  registration_open?: boolean;
  max_capacity?: number;
}

import React from 'react';

export interface FloatingIconProps {
  icon: React.ReactNode;
  label: string;
  x: string;
  y: string;
  delay: number;
}

export interface Society {
  $id: string;
  $createdAt?: string;
  $updatedAt?: string;
  name: string;
  logo_url?: string;
}
