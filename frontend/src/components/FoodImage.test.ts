import { describe, expect, it } from "vitest";
import { foodKind, suggestCategory } from "./FoodImage";
describe("foodKind", () => {
  it("suggests a category", () => { expect(suggestCategory("Milk")).toBe("Dairy"); expect(suggestCategory("Apples")).toBe("Fruit"); expect(suggestCategory("Zorblax")).toBeUndefined(); });
  it.each([["Milk", "milk"], ["milk packet", "milk"], ["Apple", "apple"], ["Apples", "apple"], ["Eggs", "egg"], ["Banana", "banana"], ["Bread", "bread"], ["Paneer", "cheese"],
    ["Greek Yogurt", "yogurt"], ["Tomatoes", "tomato"], ["Potatoes", "potato"], ["Chicken curry", "chicken"], ["Apple juice", "juice"], ["Ice cream", "icecream"],
    ["Basmati rice", "rice"], ["Orange", "orange"], ["Leftover biryani", "meal"], ["  MILK  ", "milk"], ["Watermelon", "watermelon"], ["Eggplant", "veg"], ["Bunch of bananas", "banana"], ["Hamburger", "pizza"], ["Strawberries", "strawberry"], ["Brown bread", "bread"], ["Cherry tomatoes", "grapes"]])("%s -> %s", (n, k) => expect(foodKind(n)).toBe(k));
  it("falls back to category, then to a neutral pack", () => {
    expect(foodKind("Zorblax", "Dairy")).toBe("milk"); expect(foodKind("Zorblax")).toBe("pack"); expect(foodKind("steak")).toBe("chicken");
  });
});
