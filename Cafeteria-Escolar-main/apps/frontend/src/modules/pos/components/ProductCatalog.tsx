import { PackageSearch, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { LucideIcon } from 'lucide-react'

import { formatCurrency } from '../format'
import type { Product } from '../types'

interface ProductCatalogProps {
  category: string
  subcategory: string
  onCategoryChange: (category: string) => void
  onSubcategoryChange: (subcategory: string) => void
  onAddProduct: (product: Product) => void
  categories: Array<{ id: string; label: string; icon: LucideIcon }>
  products: Product[]
  subcategories: Record<string, string[]>
}

export function ProductCatalog({
  category,
  subcategory,
  onCategoryChange,
  onSubcategoryChange,
  onAddProduct,
  categories,
  products,
  subcategories,
}: ProductCatalogProps) {
  const [query, setQuery] = useState('')
  const availableSubcategories = subcategories[category] ?? []
  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('es')
    return products.filter((product) => {
      const matchesCategory = category === 'todos' || product.category === category
      const matchesSubcategory = subcategory === 'Todas' || subcategory === 'Todos' || product.subcategory === subcategory
      const matchesQuery = !normalizedQuery || `${product.name} ${product.category} ${product.subcategory}`.toLocaleLowerCase('es').includes(normalizedQuery)
      return matchesCategory && matchesSubcategory && matchesQuery
    })
  }, [category, products, query, subcategory])

  return (
    <section className="catalog-workspace" aria-label="Catálogo de productos">
      <aside className="catalog-category-rail">
        <div className="catalog-category-title">
          <span>CARTA</span>
          <h2>Categorías</h2>
        </div>
        <nav className="category-scroll" aria-label="Categorías de productos">
          {categories.map(({ id, label, icon: Icon }) => (
            <button
              aria-current={category === id ? 'true' : undefined}
              aria-pressed={category === id}
              className="category-button"
              key={id}
              onClick={() => onCategoryChange(id)}
              type="button"
            >
              <Icon aria-hidden="true" className="size-[18px] shrink-0" />
              <span>{label}</span>
              <span className="category-chevron" aria-hidden="true">›</span>
            </button>
          ))}
        </nav>
        <div className="catalog-category-note">
          <PackageSearch aria-hidden="true" size={18} />
          <span>Elige una categoría para ver sus productos.</span>
        </div>
      </aside>

      <div className="catalog-product-panel">
        <div className="catalog-toolbar">
          <div className="catalog-heading">
            <span className="catalog-eyebrow">PUNTO DE VENTA</span>
            <h2>Productos</h2>
            <p>Selecciona un producto para agregarlo a la comanda.</p>
          </div>
          <label className="catalog-search">
            <Search aria-hidden="true" size={18} />
            <input
              aria-label="Buscar productos"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar producto..."
              type="search"
              value={query}
            />
            <kbd>⌕</kbd>
          </label>
        </div>

        {availableSubcategories.length > 1 && (
          <div className="subcategory-scroll" aria-label="Subcategorías">
            {availableSubcategories.map((item) => (
              <button
                aria-pressed={subcategory === item}
                className="subcategory-button"
                key={item}
                onClick={() => onSubcategoryChange(item)}
                type="button"
              >
                {item}
              </button>
            ))}
          </div>
        )}

        <div className="product-list-heading" aria-hidden="true">
          <span>PRODUCTO</span>
          <span>PRECIO</span>
          <span>DISPONIBILIDAD</span>
        </div>

        <div className="product-grid" aria-live="polite">
          {filteredProducts.map((product) => {
            const productCategory = categories.find(({ id }) => id === product.category)
            const Icon = productCategory?.icon ?? product.icon
            const outOfStock = product.stockQuantity !== undefined && product.stockQuantity <= 0
            return (
              <button
                aria-label={outOfStock ? `${product.name}, agotado` : `Agregar ${product.name}, ${formatCurrency(product.price)}`}
                className="product-card"
                disabled={outOfStock}
                key={product.id}
                onClick={() => onAddProduct(product)}
                type="button"
              >
                <span className={`product-card-icon ${product.tint}`}>
                  <Icon aria-hidden="true" className={product.iconColor} size={25} strokeWidth={1.9} />
                </span>
                <span className="product-card-info">
                  <span className="product-card-name">{product.shortName}</span>
                  <span className="product-card-category">{productCategory?.label ?? product.subcategory}</span>
                </span>
                <span className="product-card-price">{formatCurrency(product.price)}</span>
                <span className={`product-stock ${outOfStock ? 'is-empty' : ''}`}>
                  {product.stockQuantity === undefined ? 'Disponible' : outOfStock ? 'Agotado' : `${product.stockQuantity} disp.`}
                </span>
                <span className="product-card-add" aria-hidden="true"><Plus size={17} /></span>
              </button>
            )
          })}
          {filteredProducts.length === 0 && (
            <div className="product-empty-state">
              <PackageSearch aria-hidden="true" size={28} />
              <strong>No encontramos productos</strong>
              <span>Prueba con otra búsqueda o categoría.</span>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
