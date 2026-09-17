-- Admin (email arthurgothe.takeat@gmail.com) pode ler todos os profiles
-- pra alimentar o picker "filtrar por vendedor" no app. Resto da policy
-- segue intacto: cada user le so o proprio.
CREATE POLICY "Admin can view all profiles"
ON public.profiles
FOR SELECT
USING (
  (SELECT auth.jwt() ->> 'email') = 'arthurgothe.takeat@gmail.com'
);
