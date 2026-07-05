import { faker } from '@faker-js/faker'
import { uniqueAlphanumericToken } from './unique-id'

export function generateNoun(length: number): string {
  return faker.lorem.word(length)
}

export function generateInt(min: number, max: number): number {
  return faker.number.int({ min, max })
}

export function generateName(): string {
  return faker.person.firstName()
}

export function generatePassword(): string {
  const upper = faker.string.alpha({ casing: 'upper', length: 1 })
  const lower = faker.string.alpha({ casing: 'lower', length: 1 })
  const number = faker.string.numeric(1)
  const special = faker.string.fromCharacters('!@#$%^&*()_+[]{}<>?')
  const base = faker.internet.password({ length: 8 })
  return (base + upper + lower + number + special).split('').sort(() => 0.5 - Math.random()).join('')
}

export function generateEmail(provider: string): string {
  return faker.internet.email({ provider })
}

export function generateUniqueTestEmail(
  prefix = 'test-user',
  provider = 'viascientific.com',
): string {
  const unique = `${Date.now().toString(36)}${Math.random().toString(36).substring(2, 4)}`
  const localPart = `${prefix}.${unique}`.substring(0, 20)
  return `${localPart}@${provider}`
}

export function generateSentence(wordCount: number): string {
  return faker.lorem.sentence(wordCount)
}

export function generateDescription(): string {
  return faker.commerce.productDescription()
}

export function generateFilePath(): string {
  return faker.system.filePath()
}

export function generateFileName(name: string): string {
  return faker.system.commonFileName(name)
}

export function generateFileType(): string {
  return faker.system.commonFileType()
}

export function generateDomainName(): string {
  return faker.internet.domainName()
}

export function generatePortName(): number {
  return faker.internet.port()
}

export function generateRandomVersion(): string {
  const major = faker.number.int({ min: 0, max: 5 })
  const minor = faker.number.int({ min: 0, max: 5 })
  const patch = faker.number.int({ min: 0, max: 5 })
  return `${major}.${minor}.${patch}`
}

export function generateAlphaNumericLowerValue(length: number): string {
  return faker.string.alphanumeric({ length, casing: 'lower' })
}

export function generateAlphaNumericUpperValue(length: number): string {
  return faker.string.alphanumeric({ length, casing: 'upper' })
}

export function generateRandomValue(domain: string): string {
  const sanitized = domain.replace(/[^a-zA-Z0-9]/g, '')
  const unique = uniqueAlphanumericToken(10)
  return `${sanitized}${unique}`.substring(0, 20)
}
