<?php

/**
 * DIVE V3 - Custom Login Template for Spanish SAML IdP
 * Matches the glassmorphism aesthetic of DIVE V3
 */

$this->data['header'] = 'Ministerio de Defensa - España';
$this->data['head'] = '<link rel="stylesheet" type="text/css" href="/'. $this->data['baseurlpath'] .'module.php/core/assets/css/custom.css" />';

$this->includeAtTemplateBase('includes/header.php');

?>

<div id="content">
    <div id="header">
        <h1><?php echo $this->t('{login:user_pass_header}'); ?></h1>
        <p>Autenticación Segura para Miembros de la Defensa Nacional</p>
    </div>

    <?php
    if ($this->data['errorcode'] !== null) {
    ?>
    <div class="error">
        <strong>⚠️ Error:</strong> <?php echo $this->t('{errors:descr_'. $this->data['errorcode'].'}', $this->data['errorparams']); ?>
    </div>
    <?php
    }
    ?>

    <form action="?" method="post" name="f">
        <div class="form-group">
            <label for="username">Nombre de Usuario / Username</label>
            <input 
                type="text" 
                id="username" 
                tabindex="1" 
                name="username" 
                value="<?php echo htmlspecialchars($this->data['username']); ?>"
                placeholder="usuario@mde.es"
                autofocus
                required
            >
        </div>

        <div class="form-group">
            <label for="password">Contraseña / Password</label>
            <input 
                type="password" 
                id="password" 
                tabindex="2" 
                name="password"
                placeholder="••••••••"
                required
            >
        </div>

        <?php
        if ($this->data['rememberUsernameEnabled']) {
        ?>
        <div class="form-group" style="display: flex; align-items: center; gap: 0.5rem;">
            <input 
                type="checkbox" 
                id="remember_username" 
                tabindex="4" 
                name="remember_username" 
                value="Yes"
                <?php echo ($this->data['rememberUsernameChecked'] ? 'checked="checked"' : ''); ?>
                style="width: auto; margin: 0;"
            >
            <label for="remember_username" style="margin: 0; font-weight: normal;">
                <?php echo $this->t('{login:remember_username}'); ?>
            </label>
        </div>
        <?php
        }
        ?>

        <?php
        if ($this->data['rememberMeEnabled']) {
        ?>
        <div class="form-group" style="display: flex; align-items: center; gap: 0.5rem;">
            <input 
                type="checkbox" 
                id="remember_me" 
                tabindex="5" 
                name="remember_me" 
                value="Yes"
                <?php echo ($this->data['rememberMeChecked'] ? 'checked="checked"' : ''); ?>
                style="width: auto; margin: 0;"
            >
            <label for="remember_me" style="margin: 0; font-weight: normal;">
                <?php echo $this->t('{login:remember_me}'); ?>
            </label>
        </div>
        <?php
        }
        ?>

        <?php
        foreach ($this->data['stateparams'] as $name => $value) {
            echo '<input type="hidden" name="'. htmlspecialchars($name) .'" value="'. htmlspecialchars($value) .'" />';
        }
        ?>

        <button type="submit" class="btn" tabindex="6">
            🔐 Iniciar Sesión / Sign In
        </button>

        <div class="security-badge">
            Conexión segura mediante SAML 2.0
        </div>
    </form>

    <div id="footer">
        <p style="font-size: 0.85rem; color: #64748b; margin: 0;">
            <strong>DIVE V3</strong> - Coalition ICAM Pilot<br>
            <a href="http://localhost:3000">← Volver al Hub de Federación / Back to Federation Hub</a>
        </p>
    </div>
</div>

<?php
$this->includeAtTemplateBase('includes/footer.php');
?>

