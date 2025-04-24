import { z } from 'zod';

const nonEmptyString = z
	.string()
	.trim()
	.min(1)
	.refine((val) => !/^[.\s]+$/.test(val), {
		message: 'Must contain characters other than periods and whitespace',
	});

export const individualSignupSchema = z.object({
	accountType: z.literal('individual'),
	firstName: nonEmptyString,
	lastName: nonEmptyString,
	cpf: z.string().regex(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/),
	email: z.string().trim().email(),
	password: z.string().min(1),
});

export const businessSignupSchema = z.object({
	accountType: z.literal('business'),
	companyName: nonEmptyString,
	cnpj: z.string().regex(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/),
	email: z.string().trim().email(),
	password: z.string().min(1),
});

export const signupSchema = z.discriminatedUnion('accountType', [
	individualSignupSchema,
	businessSignupSchema,
]);

export type IndividualSignup = z.infer<typeof individualSignupSchema>;
export type BusinessSignup = z.infer<typeof businessSignupSchema>;
export type Signup = z.infer<typeof signupSchema>;
