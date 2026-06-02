import type { CollectionConfig } from 'payload'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
    group: 'System',
  },
  hooks: {
    beforeChange: [
      ({ data }) => {
        if (data?.email === 'sourav223929@sahrdaya.ac.in') {
          return { ...data, role: 'admin' }
        }
        return data
      },
    ],
  },
  fields: [
    { name: 'phone', type: 'text' },
    { name: 'sahrdayaEmail', type: 'text' },
    {
      name: 'semester',
      type: 'select',
      options: [
        { label: 'S1', value: 'S1' },
        { label: 'S2', value: 'S2' },
        { label: 'S3', value: 'S3' },
        { label: 'S4', value: 'S4' },
        { label: 'S5', value: 'S5' },
        { label: 'S6', value: 'S6' },
        { label: 'S7', value: 'S7' },
        { label: 'S8', value: 'S8' },
      ],
    },
    {
      name: 'department',
      type: 'select',
      options: [
        { label: 'Computer Science & Engineering', value: 'CSE' },
        { label: 'Electronics & Communication Engineering', value: 'ECE' },
        { label: 'Electrical & Electronics Engineering', value: 'EEE' },
        { label: 'Mechanical Engineering', value: 'ME' },
        { label: 'Civil Engineering', value: 'CE' },
        { label: 'Information Technology', value: 'IT' },
        { label: 'Applied Electronics & Instrumentation', value: 'AEI' },
        { label: 'Other', value: 'Other' },
      ],
    },
    {
      name: 'section',
      type: 'select',
      options: [
        { label: 'A', value: 'A' },
        { label: 'B', value: 'B' },
        { label: 'C', value: 'C' },
        { label: 'D', value: 'D' },
      ],
    },
    { name: 'rollNumber', type: 'text' },
    { name: 'foodPreference', type: 'text' },
    { name: 'residence', type: 'text' },
    { name: 'profileCompleted', type: 'checkbox', defaultValue: false },
    {
      name: 'role',
      type: 'select',
      options: [
        { label: 'User', value: 'user' },
        { label: 'Admin', value: 'admin' },
      ],
      defaultValue: 'user',
      required: true,
    },
    { name: 'teams', type: 'array', fields: [{ name: 'team', type: 'text' }], admin: { initCollapsed: true } },
    { name: 'appwriteUserId', type: 'text', admin: { hidden: true } },
  ],
}
