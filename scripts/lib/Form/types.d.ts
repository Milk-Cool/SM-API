type ButtonCallback = () => void;

interface IActionFormButton {
	/**
	 * Text that gets displayed on the button
	 */
	text: string;
	/**
	 * The icon that is showed with this button
	 */
	iconPath?: string;
	/**
	 * What gets called when this gets clicked
	 */
	callback?: ButtonCallback;
}

interface IMessageFormButton {
	/**
	 * Text that gets displayed on the button
	 */
	text: string;
	/**
	 * What gets called when this gets clicked
	 */
	callback?: ButtonCallback;
}

interface IModalFormArg {
	/**
	 * What this form arg is
	 */
	type: "dropdown" | "slider" | "textField" | "toggle";
	/**
	 * if this option is a dropdown this is
	 * the Values that this dropdown can have
	 */
	options?: string[];
}

type AppendFormField<Base, Next> = Base extends (...args: infer E) => infer R
	? (...args: [...E, Next]) => R
	: never;

type Enumerate<
	N extends number,
	Acc extends number[] = []
> = Acc["length"] extends N
	? Acc[number]
	: Enumerate<N, [...Acc, Acc["length"]]>;

type Range<F extends number, T extends number> =
	| Exclude<Enumerate<T>, Enumerate<F>>
	| T;

/**
 * Adds a slider to this form
 * @param label  label to be shown on this slider
 * @param minimumValue  the smallest value this can be
 * @param maximumValue  the maximum value this can be
 * @param valueStep  how this slider increments
 * @param defaultValue  the default value in slider
 * @returns this
 */
type ModalFormAddSlider = <T extends number, U extends number>(
	label: string,
	minimumValue: T,
	maximumValue: U,
	valueStep: number,
	defaultValue: number
) => ModalForm<AppendFormField<Callback, Range<T, U>>>;

type ModalFormGeneric<E extends Function = (ctx: FormCallback) => void> = E;
