"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AccountSecurity } from "./account-security";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  Download,
  ImagePlus,
  Pencil,
  Plus,
  Printer,
  QrCode,
  Search,
  Upload,
  UtensilsCrossed,
} from "lucide-react";
import { api, money, patch, post } from "@/lib/client";
import type { Category, MenuItem, Restaurant } from "@/lib/types";
import { Empty, ErrorBox, FoodImage, Modal, SectionTitle } from "./ui";

export function MenuManager({
  categories,
  restaurant,
  reload,
}: {
  categories: Category[];
  restaurant: Restaurant;
  reload: () => Promise<void>;
}) {
  const [category, setCategory] = useState("ALL");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [editing, setEditing] = useState<Partial<MenuItem>>();
  const [categoryDialog, setCategoryDialog] = useState<Partial<Category>>();
  const items = categories
    .filter((c) => category === "ALL" || c.id === category)
    .flatMap((c) => c.items)
    .filter((i) => i.name.toLowerCase().includes(query.toLowerCase()));
  const act = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    setError("");
    try {
      await fn();
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  return (
    <>
      <SectionTitle
        eyebrow="DISHES & CATEGORIES"
        title="Your menu"
        description="Fresh favourites, seasonal specials, and everything in between."
        action={
          <div className="button-group">
            <button
              className="button secondary"
              onClick={() => setCategoryDialog({})}
            >
              <Plus size={16} /> Category
            </button>
            <button
              className="button primary"
              onClick={() =>
                setEditing({
                  categoryId: categories[0]?.id,
                  isAvailable: true,
                  isVeg: true,
                  isPopular: false,
                })
              }
              disabled={!categories.length}
            >
              <Plus size={17} /> Add dish
            </button>
          </div>
        }
      />
      <ErrorBox message={error} />
      <div className="menu-summary">
        <span>
          <b>{categories.flatMap((c) => c.items).length}</b> dishes on your menu
        </span>
        <span>
          <i className="green-dot" />
          <b>
            {
              categories.flatMap((c) => c.items).filter((i) => i.isAvailable)
                .length
            }
          </b>{" "}
          available
        </span>
        <Link
          href={`/r/${restaurant.slug}`}
          target="_blank"
          className="text-link"
        >
          Preview menu <ArrowUpRight size={15} />
        </Link>
      </div>
      <div className="toolbar">
        <div className="category-filters">
          <button
            className={category === "ALL" ? "active" : ""}
            onClick={() => setCategory("ALL")}
          >
            All dishes
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              className={category === c.id ? "active" : ""}
              onClick={() => setCategory(c.id)}
            >
              {c.name}
              {!c.isActive && " (hidden)"}
            </button>
          ))}
        </div>
        <div className="search-field compact">
          <Search size={17} />
          <input
            placeholder="Find a dish…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      {category !== "ALL" && (
        <div className="category-edit-row">
          <span>{categories.find((c) => c.id === category)?.description}</span>
          <button
            className="text-link"
            onClick={() =>
              setCategoryDialog(categories.find((c) => c.id === category))
            }
          >
            <Pencil size={14} /> Edit category
          </button>
        </div>
      )}
      <div className="menu-grid">
        {items.map((item) => (
          <article
            className={`admin-dish ${item.isAvailable ? "" : "sold-out"}`}
            key={item.id}
          >
            <div className="dish-photo">
              <FoodImage src={item.imageUrl} alt={item.name} />
              {item.isPopular && (
                <span className="popular-tag">GUEST FAVOURITE</span>
              )}
              <button
                className="photo-edit"
                aria-label={`Edit ${item.name}`}
                onClick={() => setEditing(item)}
              >
                <Pencil size={16} />
              </button>
            </div>
            <div className="admin-dish-body">
              <div className="dish-name">
                <span className={`veg-symbol ${item.isVeg ? "" : "nonveg"}`}>
                  <i />
                </span>
                <h3>{item.name}</h3>
              </div>
              <p>{item.description}</p>
              <div className="dish-price-row">
                <strong>{money(item.price, restaurant.currency)}</strong>
                <span>
                  {categories.find((c) => c.id === item.categoryId)?.name}
                </span>
              </div>
              <div className="availability-row">
                <button
                  role="switch"
                  aria-checked={item.isAvailable}
                  aria-label={`${item.name} availability`}
                  className={`availability-switch ${item.isAvailable ? "on" : ""}`}
                  disabled={!!busy}
                  onClick={() =>
                    act(item.id, () =>
                      patch(`/menu/items/${item.id}/availability`, {
                        isAvailable: !item.isAvailable,
                      }),
                    )
                  }
                >
                  <span />
                  <b>{item.isAvailable ? "AVAILABLE" : "SOLD OUT"}</b>
                </button>
                <div className="reorder-buttons">
                  <button
                    className="icon-button"
                    aria-label={`Move ${item.name} up`}
                    disabled={!!busy || item.sortOrder === 0}
                    onClick={() =>
                      act(item.id, async () => {
                        const siblings = categories.find(
                          (c) => c.id === item.categoryId,
                        )!.items;
                        const index = siblings.findIndex(
                          (i) => i.id === item.id,
                        );
                        if (index > 0) {
                          const ids = siblings.map((i) => i.id);
                          [ids[index - 1], ids[index]] = [
                            ids[index],
                            ids[index - 1],
                          ];
                          await post("/menu/items/reorder", {
                            categoryId: item.categoryId,
                            itemIds: ids,
                          });
                        }
                      })
                    }
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Move ${item.name} down`}
                    disabled={!!busy}
                    onClick={() =>
                      act(item.id, async () => {
                        const siblings = categories.find(
                          (c) => c.id === item.categoryId,
                        )!.items;
                        const index = siblings.findIndex(
                          (i) => i.id === item.id,
                        );
                        if (index < siblings.length - 1) {
                          const ids = siblings.map((i) => i.id);
                          [ids[index + 1], ids[index]] = [
                            ids[index],
                            ids[index + 1],
                          ];
                          await post("/menu/items/reorder", {
                            categoryId: item.categoryId,
                            itemIds: ids,
                          });
                        }
                      })
                    }
                  >
                    <ArrowDown size={14} />
                  </button>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
      {!items.length && (
        <Empty
          icon={<UtensilsCrossed size={30} />}
          title="Make room for something delicious"
          text="Add a category and your first dish, or try another search."
        />
      )}
      {editing && (
        <Modal
          title={editing.id ? "Edit dish" : "Add a new dish"}
          onClose={() => setEditing(undefined)}
        >
          <form
            className="editor-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const data = {
                ...Object.fromEntries(f),
                price: Number(f.get("price")),
                sortOrder: Number(f.get("sortOrder")),
                preparationTime: f.get("preparationTime")
                  ? Number(f.get("preparationTime"))
                  : null,
                isVeg: f.get("isVeg") === "on",
                isPopular: f.get("isPopular") === "on",
                isAvailable: editing.isAvailable ?? true,
              };
              void act("save", async () => {
                if (editing.id) await patch(`/menu/items/${editing.id}`, data);
                else await post("/menu/items", data);
                setEditing(undefined);
              });
            }}
          >
            <ErrorBox message={error} />
            <label>
              Dish name
              <input
                required
                minLength={2}
                maxLength={100}
                name="name"
                defaultValue={editing.name}
              />
            </label>
            <label>
              Description
              <textarea
                name="description"
                maxLength={500}
                rows={2}
                defaultValue={editing.description}
              />
            </label>
            <div className="form-grid">
              <label>
                Category
                <select
                  required
                  name="categoryId"
                  defaultValue={editing.categoryId}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Price ({restaurant.currency})
                <input
                  required
                  name="price"
                  type="number"
                  min="1"
                  max="99999"
                  step="0.01"
                  defaultValue={editing.price}
                />
              </label>
              <label>
                Prep time (minutes)
                <input
                  name="preparationTime"
                  type="number"
                  min="1"
                  max="240"
                  defaultValue={editing.preparationTime || ""}
                />
              </label>
              <label>
                Display order
                <input
                  name="sortOrder"
                  type="number"
                  min="0"
                  max="10000"
                  defaultValue={
                    editing.sortOrder ??
                    categories.find((c) => c.id === editing.categoryId)?.items
                      .length ??
                    0
                  }
                />
              </label>
            </div>
            <ImageField
              label="Food photograph"
              name="imageUrl"
              value={editing.imageUrl || ""}
            />
            <div className="checkbox-row">
              <label>
                <input
                  type="checkbox"
                  name="isVeg"
                  defaultChecked={editing.isVeg}
                />{" "}
                Vegetarian
              </label>
              <label>
                <input
                  type="checkbox"
                  name="isPopular"
                  defaultChecked={editing.isPopular}
                />{" "}
                Guest favourite
              </label>
            </div>
            <button className="button primary full" disabled={!!busy}>
              {busy ? "Saving…" : "Save dish"}
              <Check size={17} />
            </button>
          </form>
        </Modal>
      )}
      {categoryDialog && (
        <Modal
          title={categoryDialog.id ? "Edit category" : "New category"}
          onClose={() => setCategoryDialog(undefined)}
        >
          <form
            className="editor-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const data = {
                name: f.get("name"),
                description: f.get("description"),
                sortOrder: Number(f.get("sortOrder")),
                isActive: f.get("isActive") === "on",
              };
              void act("category", async () => {
                if (categoryDialog.id)
                  await patch(`/menu/categories/${categoryDialog.id}`, data);
                else await post("/menu/categories", data);
                setCategoryDialog(undefined);
              });
            }}
          >
            <ErrorBox message={error} />
            <label>
              Category name
              <input
                name="name"
                required
                minLength={2}
                maxLength={60}
                defaultValue={categoryDialog.name}
              />
            </label>
            <label>
              Description
              <input
                name="description"
                maxLength={200}
                defaultValue={categoryDialog.description}
              />
            </label>
            <label>
              Display order
              <input
                name="sortOrder"
                type="number"
                min="0"
                defaultValue={categoryDialog.sortOrder ?? categories.length}
              />
            </label>
            <label className="inline-check">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={categoryDialog.isActive ?? true}
              />{" "}
              Visible on customer menu
            </label>
            <button className="button primary" disabled={!!busy}>
              Save category
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}

function ImageField({
  label,
  name,
  value,
}: {
  label: string;
  name: string;
  value: string;
}) {
  const [url, setUrl] = useState(value);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setUrl(value);
  }, [value]);
  return (
    <div className="image-field">
      <label>
        {label}
        <input
          name={name}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://… or upload a photo"
        />
      </label>
      <div className="image-upload-row">
        {url && <FoodImage src={url} alt="Image preview" />}
        <label
          className={`button secondary upload-label ${busy ? "disabled" : ""}`}
        >
          <Upload size={16} />
          {busy ? "Uploading…" : "Upload image"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 5 * 1024 * 1024) {
                setError("Please choose an image smaller than 5 MB.");
                return;
              }
              setBusy(true);
              setError("");
              const form = new FormData();
              form.append("image", file);
              try {
                const result = await api<{ url: string }>("/uploads", {
                  method: "POST",
                  body: form,
                });
                setUrl(result.url);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
        <span className="muted text-sm">JPG, PNG, WebP · up to 5 MB</span>
      </div>
      <ErrorBox message={error} />
    </div>
  );
}

export function RestaurantSettings({
  restaurant,
  reload,
}: {
  restaurant: Restaurant;
  reload: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  return (
    <>
      <SectionTitle
        eyebrow="RESTAURANT SETTINGS"
        title="Restaurant settings"
        description="A digital menu that feels unmistakably yours."
      />
      <form
        className="settings-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          setBusy(true);
          setError("");
          setSaved(false);
          try {
            await patch("/restaurant", {
              ...Object.fromEntries(form),
              acceptingOrders: form.get("acceptingOrders") === "on",
            });
            await reload();
            setSaved(true);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <section className="panel settings-panel">
          <div>
            <h2>The essentials</h2>
            <p>Permanent order code: <strong>{restaurant.orderCode}</strong></p>
            <p>Introduce your restaurant to every guest.</p>
          </div>
          <div className="editor-form">
            <label>
              Restaurant name
              <input
                name="name"
                required
                minLength={2}
                maxLength={80}
                defaultValue={restaurant.name}
              />
            </label>
            <label>
              A little about you
              <textarea
                name="description"
                maxLength={500}
                rows={3}
                defaultValue={restaurant.description}
              />
            </label>
            <div className="form-grid">
              <label>
                Phone
                <input
                  name="phone"
                  maxLength={30}
                  defaultValue={restaurant.phone}
                />
              </label>
              <label>
                GST number (optional)
                <input
                  name="gstNumber"
                  maxLength={30}
                  defaultValue={restaurant.gstNumber || ""}
                />
              </label>
            </div>
            <label>
              Address
              <input
                name="address"
                maxLength={250}
                defaultValue={restaurant.address}
              />
            </label>
            <p className="muted text-sm">
              Your permanent menu address: /r/{restaurant.slug}
            </p>
          </div>
        </section>
        <section className="panel settings-panel">
          <div>
            <h2>Your look & feel</h2>
            <p>Bring your restaurant’s personality to the screen.</p>
          </div>
          <div className="editor-form">
            <ImageField
              label="Restaurant logo"
              name="logoUrl"
              value={restaurant.logoUrl}
            />
            <ImageField
              label="Cover photograph"
              name="bannerUrl"
              value={restaurant.bannerUrl}
            />
            <label className="color-label">
              Accent colour
              <input
                name="accentColor"
                type="color"
                defaultValue={restaurant.accentColor}
              />
            </label>
          </div>
        </section>
        <section className="panel settings-panel">
          <div>
            <h2>Kitchen hours</h2>
            <p>Guests can browse any time. Orders follow your hours.</p>
          </div>
          <div className="editor-form">
            <div className="form-grid">
              <label>
                Opens at
                <input
                  name="openingTime"
                  type="time"
                  required
                  defaultValue={restaurant.openingTime}
                />
              </label>
              <label>
                Closes at
                <input
                  name="closingTime"
                  type="time"
                  required
                  defaultValue={restaurant.closingTime}
                />
              </label>
            </div>
            <label>
              Time zone (IST)
              <input name="timezone" required value="Asia/Kolkata" readOnly />
            </label>
            <label className="inline-check">
              <input
                name="acceptingOrders"
                type="checkbox"
                defaultChecked={restaurant.acceptingOrders}
              />{" "}
              Accept orders during opening hours
            </label>
            <p className="muted text-sm">
              Equal opening and closing times mean open 24 hours. Overnight
              hours are supported. Currency: {restaurant.currency}.
            </p>
          </div>
        </section>
        <ErrorBox message={error} />
        <div className="settings-save">
          {saved && (
            <span className="saved-message" role="status">
              <Check size={16} /> Changes saved
            </span>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
            <Check size={17} />
          </button>
        </div>
      </form>
      <AccountSecurity />
    </>
  );
}

export function RestaurantQR({ restaurant }: { restaurant: Restaurant }) {
  return (
    <>
      <SectionTitle
        eyebrow="YOUR RESTAURANT QR"
        title="Your restaurant QR"
        description="One QR for every table, your counter, and anywhere guests gather."
      />
      <div className="qr-layout">
        <div className="qr-print-card" id="print-qr">
          {restaurant.logoUrl ? (
            <img
              className="qr-logo"
              src={restaurant.logoUrl}
              alt={restaurant.name}
            />
          ) : (
            <span className="qr-restaurant-icon">
              <UtensilsCrossed size={30} />
            </span>
          )}
          <h2>{restaurant.name}</h2>
          <span className="eyebrow">GOOD FOOD IS A SCAN AWAY</span>
          <div className="qr-image">
            <img
              src="/api/qr"
              alt={`Scan to order at ${restaurant.name}`}
              width={280}
              height={280}
            />
          </div>
          <h3>Scan. Order. Enjoy.</h3>
          <p>
            Browse the menu. Find your favourites.
            <br />
            We’ll take it from there.
          </p>
          <div className="qr-pay-note">
            No app. No signup. Pay at the counter.
          </div>
          <span className="qr-powered">
            Powered by <b>TableBabu</b>
          </span>
        </div>
        <section className="qr-instructions">
          <span className="feature-icon">
            <QrCode size={28} />
          </span>
          <h2>
            A small square.
            <br />A smoother service.
          </h2>
          <p>
            Your QR opens your branded menu. Guests enter a name, order their
            favourites, and pay with you at the counter.
          </p>
          <ol>
            <li>
              <b>Download or print</b>
              <span>A crisp, print-ready QR for your restaurant.</span>
            </li>
            <li>
              <b>Place it where guests can see it</b>
              <span>
                Tables, the entrance, or your counter. The same QR works
                everywhere.
              </span>
            </li>
            <li>
              <b>Let the orders come to you</b>
              <span>Customer name + order number. Simple as that.</span>
            </li>
          </ol>
          <div className="button-group">
            <a className="button primary" href="/api/qr?download=1" download>
              <Download size={17} /> Download PNG
            </a>
            <button className="button secondary" onClick={() => window.print()}>
              <Printer size={17} /> Print QR
            </button>
          </div>
          <Link
            href={`/r/${restaurant.slug}`}
            target="_blank"
            className="text-link"
          >
            Open your customer menu <ArrowUpRight size={16} />
          </Link>
          <p className="muted text-sm">
            QR links use your configured APP_ORIGIN. For phones, this must be a
            publicly reachable HTTPS address.
          </p>
        </section>
      </div>
    </>
  );
}
