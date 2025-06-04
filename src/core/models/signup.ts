import { z } from 'zod';

const nonEmptyString = z
	.string()
	.trim()
	.min(1)
	.refine((val) => !/^[.\s]+$/.test(val), {
		message: 'Must contain characters other than periods and whitespace',
	});

const emailString = z
	.string()
	.trim()
	.email()
	.refine((val) => val.includes('@') && val.includes('.'), {
		message: 'Email must contain both @ and . characters',
	})
	.refine((val) => val.length >= 5, {
		message: 'Email must be at least 5 characters long',
	})
	.refine((val) => !val.startsWith('.') && !val.endsWith('.'), {
		message: 'Email cannot start or end with a period',
	})
	.refine((val) => !val.includes('..'), {
		message: 'Email cannot contain consecutive periods',
	})
	.refine(
		(val) => {
			const parts = val.split('.');
			const tld = parts[parts.length - 1];
			return tld.length >= 2;
		},
		{
			message: 'Email TLD must be at least 2 characters long',
		},
	);

export const individualSignupSchema = z.object({
	accountType: z.literal('individual'),
	firstName: nonEmptyString,
	lastName: nonEmptyString,
	cpf: z.string().regex(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/),
	email: emailString,
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
