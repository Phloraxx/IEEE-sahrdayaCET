import type { AdminViewServerProps } from 'payload'
import { Gutter } from '@payloadcms/ui'
import React from 'react'

const BillingView: React.FC<AdminViewServerProps> = () => {
  return (
    <Gutter>
      <h1>Billing & Payment Tracking</h1>
      <p>Payment and billing overview will be displayed here using the orders collection data.</p>
    </Gutter>
  )
}

export default BillingView
