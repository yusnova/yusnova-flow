import { Locator, Page } from '@playwright/test'
import { BasePage } from './base-page'

export class InventoryPage extends BasePage {
  readonly reactBurgerMenuBtn: Locator
  readonly openMenu: Locator
  readonly shoppingCartLink: Locator
  readonly productSortSelect: Locator
  readonly inventoryItemName: Locator

  constructor(page: Page) {
    super(page)
    this.reactBurgerMenuBtn = page.locator('#react-burger-menu-btn')
    this.openMenu = page.locator('[data-test="open-menu"]')
    this.shoppingCartLink = page.locator('[data-test="shopping-cart-link"]')
    this.productSortSelect = page.locator('[data-test="product-sort-container"]')
    this.inventoryItemName = page.locator('[data-test="inventory-item-name"]')
  }

  itemImgLink(index: number): Locator {
    return this.page.locator(`[data-test="item-${index}-img-link"]`)
  }

  itemTitleLink(index: number): Locator {
    return this.page.locator(`[data-test="item-${index}-title-link"]`)
  }

  addToCart(productSlug: string): Locator {
    return this.page.locator(`[data-test="add-to-cart-${productSlug}"]`)
  }

  socialLink(network: string): Locator {
    return this.page.locator(`[data-test="social-${network}"]`)
  }

  itemImgLinks(): Locator {
    return this.page.locator('[data-test^="item-"][data-test$="-img-link"]')
  }

  itemTitleLinks(): Locator {
    return this.page.locator('[data-test^="item-"][data-test$="-title-link"]')
  }

  async goto(): Promise<void> {
    await this.page.goto('/inventory.html')
  }

  async clickReactBurgerMenu(): Promise<void> {
    await this.reactBurgerMenuBtn.click()
  }

  async clickOpenMenu(): Promise<void> {
    await this.openMenu.click()
  }

  async clickShoppingCart(): Promise<void> {
    await this.shoppingCartLink.click()
  }

  async selectProductSort(value: string): Promise<void> {
    await this.productSortSelect.selectOption(value)
  }

  async clickInventoryItemName(): Promise<void> {
    await this.inventoryItemName.click()
  }

  async openItemImage(index: number): Promise<void> {
    await this.itemImgLink(index).click()
  }

  async openItemTitle(index: number): Promise<void> {
    await this.itemTitleLink(index).click()
  }

  async addProductToCart(productSlug: string): Promise<void> {
    await this.addToCart(productSlug).click()
  }

  async openSocialLink(network: string): Promise<void> {
    await this.socialLink(network).click()
  }

}
