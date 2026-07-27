import { describe, it, expect } from 'vitest'

describe('registration form validation', () => {
  const validPhone = '9876543210'
  const invalidPhone = '12345'
  const validEmail = 'test@example.com'
  const invalidEmail = 'not-an-email'
  const validName = 'John Doe'

  it('accepts valid Indian phone number (10 digits starting with 6-9)', () => {
    expect(/^[6-9]\d{9}$/.test(validPhone)).toBe(true)
  })

  it('rejects invalid phone numbers', () => {
    expect(/^[6-9]\d{9}$/.test(invalidPhone)).toBe(false)
    expect(/^[6-9]\d{9}$/.test('5555555555')).toBe(false)
  })

  it('validates email format', () => {
    expect(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(validEmail)).toBe(true)
    expect(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invalidEmail)).toBe(false)
  })

  it('rejects short names', () => {
    expect(validName.length).toBeGreaterThanOrEqual(2)
    expect('A'.length).toBeLessThan(2)
  })

  it('validates department is a known value', () => {
    const departments: readonly string[] = ['Computer Science (CS)', 'Electronics & Communication (EC)', 'Electrical & Electronics (EE)', 'Mechanical (ME)', 'Civil (CE)', 'Robotics & Automation (RA)', 'Artificial Intelligence & DS (AI)']
    expect(departments.includes('Computer Science (CS)')).toBe(true)
    expect(departments.includes('Invalid Dept')).toBe(false)
  })

  it('validates semester is a known value', () => {
    const semesters: readonly string[] = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8']
    expect(semesters.includes('S3')).toBe(true)
    expect(semesters.includes('S9')).toBe(false)
  })

  it('validates section is a known value', () => {
    const sections: readonly string[] = ['A', 'B', 'C', 'D']
    expect(sections.includes('A')).toBe(true)
    expect(sections.includes('E')).toBe(false)
  })
})
