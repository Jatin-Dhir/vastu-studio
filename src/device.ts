/** Central device model — behavior adapts to what the user is actually holding. */

export const IS_TOUCH =
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

export const isPhoneWidth = () =>
  typeof window !== 'undefined' && window.innerWidth <= 760

/** Fine pointer + keyboard assumed: desktops and laptops. */
export const IS_DESKTOP = !IS_TOUCH
