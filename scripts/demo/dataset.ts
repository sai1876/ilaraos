import { commonDemoFields } from './manifest';

export const demoDataset = {
  staff: [
    {
      id: 'demo-owner-1',
      name: 'Ilara Owner',
      role: 'owner',
      email: 'owner@ilara.com',
      outlet_id: 'main',
      status: 'active',
      ...commonDemoFields
    },
    {
      id: 'demo-manager-1',
      name: 'Ilara Manager',
      role: 'manager',
      email: 'manager@ilara.com',
      outlet_id: 'main',
      status: 'active',
      ...commonDemoFields
    },
    {
      id: 'demo-kitchen-1',
      name: 'Chef One',
      role: 'chef',
      email: 'chef@ilara.com',
      outlet_id: 'main',
      status: 'active',
      ...commonDemoFields
    }
  ],
  menu: [
    {
      item_id: 'item-1',
      name: 'Classic Burger',
      category: 'Mains',
      price: 250,
      is_available: true,
      description: 'A classic burger with cheese and lettuce.',
      ...commonDemoFields
    },
    {
      item_id: 'item-2',
      name: 'Fries',
      category: 'Sides',
      price: 100,
      is_available: true,
      description: 'Crispy golden fries.',
      ...commonDemoFields
    }
  ],
  inventory: [
    {
      id: 'inv-1',
      item_name: 'Burger Buns',
      quantity: 100,
      unit: 'pcs',
      reorder_level: 20,
      critical_level: 10,
      ...commonDemoFields
    },
    {
      id: 'inv-2',
      item_name: 'Potatoes',
      quantity: 50,
      unit: 'kg',
      reorder_level: 10,
      critical_level: 5,
      ...commonDemoFields
    }
  ]
};
