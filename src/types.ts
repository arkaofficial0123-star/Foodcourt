/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  imageUrl: string;
  createdAt: string;
  categoryId?: string;
}

export interface Category {
  id: string;
  name: string;
  imageUrl: string;
  createdAt: string;
}

export interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export interface Order {
  id: string;
  tableId: string;
  items: OrderItem[];
  total: number;
  status: "pending" | "accepted" | "completed";
  createdAt: string;
  updatedAt: string;
}

export interface BannerSettings {
  text: string;
  imageUrl: string;
  visible: boolean;
  bioVisible?: boolean;
  updatedAt: string;
}
